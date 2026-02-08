"""
Real LLM integration: single agentic advisor. LLM gets full context and decides
whether to ask a question or offer the personalized plan (premium smart home designer).
"""
from __future__ import annotations
import json
import re
from typing import Any, Dict, List, Tuple

from app.core.config import settings
from app.core.logging import get_logger
from app.core.llm_call_logger import log_llm_call
from app.core.prompts import get_prompt

logger = get_logger("llm.openai")

# Type alias for (reply, action, layout_updates)
AdvisorResult = Tuple[str, str, Dict[str, Any] | None]  # (reply, "ask" | "offer_plan", layout_updates or None)


def _openai_client():
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=settings.openai_api_key)
    except Exception as e:
        logger.debug("OpenAI client init failed: %s", e)
        return None


def generate_advisor_response(
    persona: Dict[str, Any],
    layout: Dict[str, Any],
    messages: List[Dict[str, str]],
    recos: List[Dict[str, Any]],
    bundle_id: str | None,
    estimated_monthly: float | None,
    product_names: Dict[str, str],
) -> AdvisorResult | None:
    """
    Single agentic call: LLM has full context and decides next step.
    Returns (reply_text, "ask" | "offer_plan", layout_updates) or None if API unavailable.
    layout_updates is a dict with updated rooms/layout if LLM detected changes, else None.
    """
    client = _openai_client()
    if not client:
        return None

    # Normalize to list of dicts (caller may pass Pydantic models)
    recos = [x.model_dump() if hasattr(x, "model_dump") else x for x in (recos or [])]
    _messages: List[Dict[str, str]] = []
    for m in (messages or []):
        if isinstance(m, dict):
            _messages.append(m)
        else:
            _messages.append({"role": getattr(m, "role", None), "content": (getattr(m, "content", None) or "")})
    messages = _messages

    # Build context for the LLM (no raw IDs in narrative; use product names)
    name = persona.get("name") or "there"
    layout_type = layout.get("layout_type", "home")
    rooms = layout.get("rooms", [])
    # Check both confidence and layout_confidence (layout_confidence is preferred in editor spec)
    layout_confidence = layout.get("layout_confidence") or layout.get("confidence")
    try:
        conf = float(layout_confidence) if layout_confidence is not None else 1.0
    except (TypeError, ValueError):
        conf = 1.0
    room_list = []
    for room in (rooms or []):
        if not isinstance(room, dict):
            continue
        room_name = room.get("room", room.get("name", ""))
        w, l, h = room.get("width"), room.get("length"), room.get("height")
        area = room.get("area")
        dims = " × ".join(str(x) for x in (w, l, h) if x is not None and x != "")
        part = room_name
        if dims:
            part += f" W×L×H: {dims}"
        if area:
            part += f" area: {area}"
        elif room.get("estimated_size"):
            part += f" ({room.get('estimated_size')})"
        room_list.append(part)
    entry_points = layout.get("entry_points", [])

    by_room: Dict[str, List[Dict[str, Any]]] = {}
    for rec in recos:
        pid = rec.get("product_id", "")
        by_room.setdefault(rec.get("room", ""), []).append({
            "product": product_names.get(pid, pid),
            "why": rec.get("why", ""),
        })

    # Check if an image was uploaded (even if analysis failed or is incomplete)
    has_source_file = bool(layout.get("source_filename"))
    source_filename = layout.get("source_filename", "")
    
    # Consider layout valid when we have rooms (even with low confidence - analysis attempted)
    # If rooms exist, analysis succeeded - acknowledge what was found
    has_layout = len(rooms) > 0
    
    # Log layout state for debugging
    logger.debug(
        "llm_openai layout state: has_source_file=%s source_filename=%s has_layout=%s rooms_count=%d conf=%.2f",
        has_source_file, source_filename, has_layout, len(rooms), conf
    )
    
    # Build context: provide facts only, let LLM decide based on context + history + user intent
    context_parts = [f"Customer: {name}"]
    
    if has_source_file:
        context_parts.append(f"Floor plan uploaded: {layout.get('source_filename', 'floor plan')}")
    
    if has_layout:
        context_parts.append(f"Layout type: {layout_type}")
        context_parts.append(f"Confidence: {conf:.2f}")
        context_parts.append(f"Rooms: {', '.join(room_list) if room_list else 'none'}")
        if entry_points:
            context_parts.append(f"Entry points: {entry_points}")
    elif has_source_file:
        context_parts.append("No rooms detected from analysis")
    
    context = ". ".join(context_parts) + ". "
    units = layout.get("measurement_units")
    total_area = layout.get("total_area")
    mentioned_area = layout.get("mentioned_spaces_area")
    unassigned = layout.get("unassigned_space")
    if any((units, total_area, mentioned_area, unassigned)):
        area_parts = []
        if units:
            area_parts.append(f"units: {units}")
        if total_area:
            area_parts.append(f"total: {total_area}")
        if mentioned_area:
            area_parts.append(f"named rooms: {mentioned_area}")
        if unassigned:
            area_parts.append(f"walls/corridors: {unassigned}")
        context += " Areas: " + ", ".join(area_parts) + ". "
    context += f"When you present the plan, use these recommendations by room (product name + benefit): {json.dumps(by_room)}. "
    if bundle_id:
        context += f"Bundle: {bundle_id}. "
    if estimated_monthly is not None:
        context += f"Estimated monthly: AED {estimated_monthly:.0f}."

    system_base = get_prompt("advisor_system")
    if not system_base:
        logger.warning("advisor_system prompt file missing or empty; using minimal fallback")
        system_base = (
            "You are an e& Smart Living advisor. Reply in JSON only: {\"reply\": \"...\", \"action\": \"ask\" or \"offer_plan\"}. "
            "Be conversational; use the context below for layout and recommendations."
        )
    system_prompt = system_base + "\n\n---\nContext (use this information along with conversation history to understand user intent and respond naturally):\n" + context

    # (advisor system prompt loaded from prompts/advisor_system.md)

    # Pass conversation as real chat turns so the model uses history (what they said, what we said)
    openai_messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
    ]
    for m in messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            openai_messages.append({"role": role, "content": content})

    try:
        logger.debug("calling OpenAI advisor (agentic)")
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=openai_messages,
            max_tokens=600,
            response_format={"type": "json_object"},
        )
        raw = (resp.choices[0].message.content or "").strip()
        if not raw:
            logger.warning("OpenAI advisor returned empty content")
            return None
        last_user = ""
        for m in reversed(openai_messages):
            if m.get("role") == "user":
                c = m.get("content") or ""
                last_user = c[:500] if isinstance(c, str) else "[multimodal]"
                break
        log_llm_call(
            "advisor",
            {"messages_count": len(openai_messages), "last_user_preview": last_user},
            raw,
        )
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
            raw = raw.strip()
        data = None
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Try to extract a JSON object from the response (model may have added text around it)
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    data = json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    pass
        if not data or not isinstance(data, dict):
            logger.warning(
                "OpenAI advisor response was not valid JSON (first 200 chars): %s",
                raw[:200] if len(raw) > 200 else raw,
            )
            return None
        reply = (data.get("reply") or "").strip()
        action = (data.get("action") or "offer_plan").lower()
        if action not in ("ask", "offer_plan"):
            action = "offer_plan"
        if not reply:
            logger.warning("OpenAI advisor JSON had empty reply")
            return None
        
        # Extract layout_updates if present (LLM detected room changes)
        layout_updates = data.get("layout_updates")
        if layout_updates and isinstance(layout_updates, dict):
            logger.debug("LLM returned layout_updates: %d rooms", len(layout_updates.get("rooms", [])))
        else:
            layout_updates = None
        
        return (reply, action, layout_updates)
    except Exception as e:
        logger.warning("OpenAI advisor call failed: %s", e, exc_info=True)
        return None
