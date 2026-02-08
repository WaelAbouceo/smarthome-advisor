"""
Layout from natural language: the LLM parses a user description of their home
into structured layout (rooms, sizes, entry points). No hardcoded rules — the
LLM is the brain for understanding the space from text.
"""
from __future__ import annotations
import hashlib
import json
import re
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.llm_call_logger import log_llm_call
from app.core.prompts import get_prompt
from app.models.layout import LayoutAnalysis

logger = get_logger("layout.description")

# Fallback if prompts/layout_description.md is missing
_LAYOUT_DESCRIPTION_PROMPT_FALLBACK = """You are a smart living consultant. The customer described their home or office in natural language. Extract a structured layout from their description.

**Units:** Infer the measurement units from their description (e.g. "meters", "m²", "sq ft", "feet"). Use ONE unit system consistently (e.g. "m" and "sq m", or "ft" and "sq ft") for all dimensions and areas. Default to meters if unclear.

Reply with ONLY a valid JSON object (no markdown, no extra text) with this exact structure:
{
  "measurement_units": "m" or "ft",
  "layout_type": "apartment" | "villa" | "office" | "unknown",
  "layout_confidence": 0.0 to 1.0,
  "total_area": "e.g. 120 sq m — total floor area if stated or estimable, else omit or null",
  "rooms": [
    {
      "room": "Room name",
      "room_type": "living"|"bedroom"|"bathroom"|"kitchen"|"entry"|"workspace"|"meeting"|"other",
      "width": "value + unit or omit",
      "length": "value + unit or omit",
      "height": "value + unit or omit",
      "area": "value + unit, e.g. 14 sq m, or omit"
    }
  ],
  "mentioned_spaces_area": "e.g. 95 sq m — sum of all named room areas in same unit, or null if not computable",
  "unassigned_space": "e.g. 25 sq m — estimate for walls/corridors in same unit, or 'unknown', or null",
  "entry_points": ["Front door", "..."],
  "notes": ["Short note if relevant"]
}

- Infer layout_type from context. For each room they mention, add an entry; if they give sizes, set width, length, area in the chosen unit.
- total_area: from their description if given; otherwise estimate from room sum or null.
- mentioned_spaces_area: sum of room areas you listed; same unit.
- unassigned_space: rough estimate for walls/circulation if total and room sum known; else "unknown" or null.
- layout_confidence: 0.7–1.0 if clear, lower if vague. If no entry points mentioned, use ["Main entrance"]."""



def _openai_client():
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=settings.openai_api_key)
    except Exception as e:
        logger.debug("OpenAI client init failed: %s", e)
        return None


def _layout_id_from_description(description: str) -> str:
    return f"layout_desc_{hashlib.sha1(description.encode()).hexdigest()[:12]}"


def extract_layout_from_description(description: str) -> LayoutAnalysis | None:
    """
    Use the LLM to interpret a natural-language description of the home/office
    and return a structured LayoutAnalysis. Returns None if API is unavailable
    or the response cannot be parsed.
    """
    description = (description or "").strip()
    if not description:
        return None

    client = _openai_client()
    if not client:
        logger.debug("layout from description skipped: no OpenAI API key")
        return None

    prompt = get_prompt("layout_description") or _LAYOUT_DESCRIPTION_PROMPT_FALLBACK

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"Customer description:\n\n{description}\n\nExtract the layout as JSON."},
            ],
            max_tokens=1024,
        )
        raw = (resp.choices[0].message.content or "").strip()
        log_llm_call(
            "layout_description",
            {"description_preview": (description or "")[:500]},
            raw,
        )
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
        data = json.loads(raw)

        layout_type = str(data.get("layout_type") or "unknown").lower()
        if layout_type not in ("apartment", "villa", "office", "unknown"):
            layout_type = "unknown"

        rooms_raw = data.get("rooms") or []
        rooms: list[dict[str, Any]] = []
        for r in rooms_raw:
            if isinstance(r, dict) and r.get("room"):
                room_dict: dict[str, Any] = {
                    "room": str(r["room"]),
                    "room_type": str(r.get("room_type") or r.get("type") or "other"),
                }
                for key in ("width", "length", "height", "area"):
                    if r.get(key):
                        room_dict[key] = str(r[key])
                rooms.append(room_dict)

        entry_points = [str(x) for x in (data.get("entry_points") or []) if x] or ["Main entrance"]
        notes = [str(x) for x in (data.get("notes") or []) if x]
        if not notes:
            notes = ["Layout inferred from your description."]

        try:
            conf = float(data.get("layout_confidence", 0.8))
            conf = max(0.0, min(1.0, conf))
        except (TypeError, ValueError):
            conf = 0.8

        measurement_units = (data.get("measurement_units") or "").strip() or None
        total_area = (data.get("total_area") or "").strip() or None
        mentioned_spaces_area = (data.get("mentioned_spaces_area") or "").strip() or None
        unassigned_space = (data.get("unassigned_space") or "").strip() or None

        layout_id = _layout_id_from_description(description)
        logger.info(
            "layout from description layout_id=%s type=%s rooms=%d confidence=%.2f units=%s total=%s",
            layout_id, layout_type, len(rooms), conf, measurement_units, total_area,
        )
        return LayoutAnalysis(
            layout_id=layout_id,
            layout_type=layout_type,
            rooms=rooms,
            entry_points=entry_points,
            notes=notes,
            confidence=conf,
            source_filename=None,
            measurement_units=measurement_units,
            total_area=total_area,
            mentioned_spaces_area=mentioned_spaces_area,
            unassigned_space=unassigned_space,
        )
    except json.JSONDecodeError as e:
        logger.warning("layout from description: invalid JSON %s", e)
        return None
    except Exception as e:
        logger.debug("layout from description failed: %s", e, exc_info=True)
        return None
