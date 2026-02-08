"""
Layout from image/PDF: use vision LLM (GPT-4o) to analyze floor plans and extract
structured layout data (rooms, dimensions, areas, entry points).
"""
from __future__ import annotations
import base64
import hashlib
import json
import re
from typing import Any

from app.core.logging import get_logger
from app.core.llm_call_logger import log_llm_call
from app.core.prompts import get_prompt
from app.models.layout import LayoutAnalysis

logger = get_logger("layout.vision")

# Fallback if prompts/layout_vision.md is missing (same content as default file)
_LAYOUT_VISION_PROMPT_FALLBACK = """You are analyzing a floor plan image (apartment, villa, or office). Extract dimensions and areas.

**Units:** Detect the measurement units used on the plan (scale, dimensions, labels). Use the SAME units consistently for all dimensions and areas (e.g. if the plan shows meters, use "m" and "sq m"; if feet, use "ft" and "sq ft"). Do not mix units.

Reply with ONLY a valid JSON object (no markdown, no extra text) with this exact structure:
{
  "measurement_units": "m" or "ft",
  "layout_type": "apartment" | "villa" | "office" | "unknown",
  "layout_confidence": 0.0 to 1.0,
  "total_area": "e.g. 250 sq m — total floor/plot area of the layout",
  "rooms": [
    {
      "room": "Room name",
      "room_type": "living"|"bedroom"|"bathroom"|"kitchen"|"entry"|"workspace"|"meeting"|"other",
      "width": "value + unit, e.g. 4.2 m",
      "length": "value + unit, e.g. 3.5 m",
      "height": "value + unit if known, else omit",
      "area": "value + unit, e.g. 14.7 sq m (W×L or from plan)",
      "size_confidence": 0.0 to 1.0
    }
  ],
  "mentioned_spaces_area": "e.g. 180 sq m — sum of all named room areas in same unit",
  "unassigned_space": "e.g. 70 sq m — walls, corridors, circulation, or short note like 'walls and corridors ~70 sq m'",
  "entry_points": ["Front door", "..."],
  "notes": ["Short note 1", "Short note 2"]
}

- measurement_units: Use the unit system from the plan (m or ft). All numeric values must use this.
- total_area: Total built/floor area. Same unit as rooms (e.g. "250 sq m").
- For each room: width, length, area in that unit. area can be W×L or read from plan.
- mentioned_spaces_area: Sum of all room areas you listed. Same unit.
- unassigned_space: Estimate for walls, corridors, thickness; or "unknown" if not inferrable. Same unit when numeric.
- layout_confidence and size_confidence: 1.0 = very confident, 0.5 = uncertain."""

# Lazy import to avoid requiring openai when key is not set
def _openai_client():
    from openai import OpenAI
    from app.core.config import settings
    if not settings.openai_api_key:
        return None
    return OpenAI(api_key=settings.openai_api_key)


def _sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()


def _pdf_to_image_bytes(content: bytes) -> bytes | None:
    """Render first page of PDF to PNG bytes. Returns None if not PDF or error."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        if doc.page_count == 0:
            doc.close()
            return None
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=150, alpha=False)
        img_bytes = pix.tobytes("png")
        doc.close()
        return img_bytes
    except Exception:
        return None


def _image_bytes_to_base64_url(content: bytes, media_type: str = "image/png") -> str:
    b64 = base64.standard_b64encode(content).decode("ascii")
    return f"data:{media_type};base64,{b64}"


def _analyze_with_ollama_vision(filename: str, content: bytes) -> LayoutAnalysis | None:
    """
    Use Ollama with vision-capable model (Llama 4 Scout) to analyze floor plan.
    """
    try:
        import os
        import requests
        
        # Get Ollama config from environment
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        token = os.environ.get("OLLAMA_TOKEN")
        
        if not base_url:
            logger.debug("Ollama vision skipped: OLLAMA_BASE_URL not set")
            return None
        
        # Convert image to base64
        if filename.lower().endswith(".pdf") or content[:4] == b"%PDF":
            logger.debug("converting PDF to image for Ollama vision filename=%s", filename)
            image_bytes = _pdf_to_image_bytes(content)
            if not image_bytes:
                logger.warning("PDF to image failed, cannot use Ollama vision filename=%s", filename)
                return None
        else:
            image_bytes = content
        
        if not image_bytes or len(image_bytes) > 20 * 1024 * 1024:  # 20 MB limit
            logger.debug("Ollama vision skipped: empty or too large size=%d", len(image_bytes) if image_bytes else 0)
            return None
        
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        
        logger.info("calling Ollama vision model filename=%s image_size=%d", filename, len(image_bytes))
        
        prompt = get_prompt("layout_vision") or _LAYOUT_VISION_PROMPT_FALLBACK
        
        # Call Ollama API with vision using session-cookie auth for Cloudflare tunnel
        session = requests.Session()
        if token:
            r = session.get(
                f"{base_url.rstrip('/')}/",
                params={"token": token},
                timeout=60,
            )
            r.raise_for_status()

        payload = {
            "model": "llama4:scout",
            "prompt": prompt,
            "images": [image_b64],
            "stream": False,
            "format": "json",
            "options": {
                "num_predict": 4096,  # enough tokens for 15+ rooms in JSON
            },
        }

        response = session.post(
            f"{base_url.rstrip('/')}/api/generate",
            json=payload,
            timeout=600,  # 10 minutes
        )
        response.raise_for_status()

        data = response.json()
        raw_response = data.get("response", "").strip()

        if not raw_response:
            logger.warning("Ollama vision returned empty response")
            return None

        logger.info("Ollama vision raw response (%d chars): %s", len(raw_response), raw_response[:300])
        
        # Parse JSON response
        try:
            start = raw_response.find("{")
            end = raw_response.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = raw_response[start:end]
                layout_data = json.loads(json_str)
            else:
                logger.warning("No JSON found in Ollama vision response")
                return None
        except json.JSONDecodeError as e:
            logger.warning("Failed to parse Ollama vision JSON: %s", e)
            return None
        
        # Convert to LayoutAnalysis
        layout_id = f"layout_{_sha1_bytes(content)[:10]}"
        rooms = layout_data.get("rooms", [])
        
        # Normalize room data
        normalized_rooms = []
        for room in rooms:
            if isinstance(room, dict):
                normalized_rooms.append({
                    "room": room.get("room", room.get("name", "Unknown")),
                    "room_type": room.get("room_type", "other"),
                    "width": room.get("width"),
                    "length": room.get("length"),
                    "area": room.get("area"),
                    "size_confidence": room.get("size_confidence", 0.8),
                })
        
        # Build kwargs, including optional area fields from the vision model
        layout_kwargs: dict[str, Any] = dict(
            layout_id=layout_id,
            layout_type=layout_data.get("layout_type", "unknown"),
            rooms=normalized_rooms,
            entry_points=layout_data.get("entry_points", []),
            notes=layout_data.get("notes", []),
            confidence=float(layout_data.get("layout_confidence", 0.8)),
            source_filename=filename,
        )
        for optional_field in ("measurement_units", "total_area", "mentioned_spaces_area", "unassigned_space"):
            if layout_data.get(optional_field):
                layout_kwargs[optional_field] = layout_data[optional_field]

        result = LayoutAnalysis(**layout_kwargs)
        
        logger.info("Ollama vision analysis complete layout_id=%s rooms=%d confidence=%.2f", 
                   layout_id, len(normalized_rooms), result.confidence)
        
        return result
        
    except requests.exceptions.RequestException as e:
        logger.warning("Ollama vision API error: %s", e)
        return None
    except Exception as e:
        logger.warning("Ollama vision analysis failed: %s", e, exc_info=True)
        return None


def _infer_media_type(filename: str, content: bytes) -> str:
    fname = (filename or "").lower()
    if fname.endswith(".png") or content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if fname.endswith(".jpg") or fname.endswith(".jpeg") or content[:2] == b"\xff\xd8":
        return "image/jpeg"
    if fname.endswith(".webp"):
        return "image/webp"
    if fname.endswith(".pdf") or content[:4] == b"%PDF":
        return "application/pdf"
    return "image/png"


def analyze_layout_with_vision(filename: str, content: bytes) -> LayoutAnalysis | None:
    """
    Use vision LLM to analyze the floor plan image.
    Tries Ollama (Llama 4 Scout with vision) first, falls back to OpenAI GPT-4o if available.
    """
    # Try Ollama with vision first
    import os
    llm_provider = os.environ.get("LLM_PROVIDER", "openai").lower()
    
    logger.info("analyze_layout_with_vision provider=%s filename=%s size=%d", llm_provider, filename, len(content))

    if llm_provider == "ollama":
        result = _analyze_with_ollama_vision(filename, content)
        if result is not None:
            return result
        logger.warning("Ollama vision failed for %s, falling back to OpenAI if available", filename)

    # Fallback to OpenAI GPT-4o
    client = _openai_client()
    if not client:
        logger.warning("vision skipped: no OpenAI API key and Ollama not available (provider=%s)", llm_provider)
        return None

    # Normalize to image bytes
    media_type = _infer_media_type(filename, content)
    if media_type == "application/pdf":
        logger.debug("converting PDF to image filename=%s", filename)
        image_bytes = _pdf_to_image_bytes(content)
        if not image_bytes:
            logger.warning("PDF to image failed filename=%s", filename)
            return None
        media_type = "image/png"
        logger.debug("PDF rendered to image size=%d", len(image_bytes))
    else:
        image_bytes = content

    if not image_bytes or len(image_bytes) > 20 * 1024 * 1024:  # 20 MB limit
        logger.debug("vision skipped: empty or too large size=%d", len(image_bytes) if image_bytes else 0)
        return None

    image_url = _image_bytes_to_base64_url(image_bytes, media_type)
    logger.info("calling vision model filename=%s media_type=%s image_size=%d", filename, media_type, len(image_bytes))

    prompt = get_prompt("layout_vision") or _LAYOUT_VISION_PROMPT_FALLBACK

    raw = ""
    try:
        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            max_tokens=1024,
        )
        raw = (resp.choices[0].message.content or "").strip()
        log_llm_call(
            "layout_vision",
            {"filename": filename, "prompt_len": len(prompt), "image_size_bytes": len(image_bytes)},
            raw,
        )
        # Strip markdown code block if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
        data = json.loads(raw)

        layout_type = str(data.get("layout_type") or "unknown").lower()
        if layout_type not in ("apartment", "villa", "office", "unknown"):
            layout_type = "unknown"

        rooms_raw = data.get("rooms") or []
        rooms = []
        for r in rooms_raw:
            if isinstance(r, dict):
                name = r.get("room") or r.get("name")
                rtype = r.get("room_type") or r.get("type") or "other"
                if name:
                    room_dict: dict[str, Any] = {"room": str(name), "room_type": str(rtype)}
                    if r.get("estimated_size"):
                        room_dict["estimated_size"] = str(r["estimated_size"])
                    for key in ("width", "length", "height", "area"):
                        if r.get(key):
                            room_dict[key] = str(r[key])
                    if r.get("size_confidence") is not None:
                        try:
                            room_dict["size_confidence"] = float(r["size_confidence"])
                        except (TypeError, ValueError):
                            pass
                    rooms.append(room_dict)

        entry_points = [str(x) for x in (data.get("entry_points") or []) if x]
        notes = [str(x) for x in (data.get("notes") or []) if x]
        if not notes:
            notes = ["Layout analyzed by vision model."]

        try:
            conf = float(data.get("layout_confidence", 0.85))
            conf = max(0.0, min(1.0, conf))
        except (TypeError, ValueError):
            conf = 0.85

        measurement_units = (data.get("measurement_units") or "").strip() or None
        total_area = (data.get("total_area") or "").strip() or None
        mentioned_spaces_area = (data.get("mentioned_spaces_area") or "").strip() or None
        unassigned_space = (data.get("unassigned_space") or "").strip() or None

        layout_id = f"layout_{_sha1_bytes(content)[:10]}"
        logger.info(
            "vision layout parsed layout_id=%s type=%s rooms=%d confidence=%.2f units=%s total=%s",
            layout_id, layout_type, len(rooms), conf, measurement_units, total_area,
        )
        return LayoutAnalysis(
            layout_id=layout_id,
            layout_type=layout_type,
            rooms=rooms,
            entry_points=entry_points or ["Main entrance"],
            notes=notes,
            confidence=conf,
            source_filename=filename,
            measurement_units=measurement_units,
            total_area=total_area,
            mentioned_spaces_area=mentioned_spaces_area,
            unassigned_space=unassigned_space,
        )
    except json.JSONDecodeError as e:
        logger.warning("vision response not valid JSON: %s raw_len=%d", e, len(raw) if raw else 0)
        return None
    except Exception as e:
        logger.debug("vision analysis failed: %s", e, exc_info=True)
        return None
