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
    
    # Consider layout valid when we have rooms and reasonable confidence (even if layout_type is "unknown")
    has_layout = len(rooms) > 0 and conf >= 0.5
    
    # Log layout state for debugging
    logger.debug(
        "llm_openai layout state: has_source_file=%s source_filename=%s has_layout=%s rooms_count=%d conf=%.2f",
        has_source_file, source_filename, has_layout, len(rooms), conf
    )
    
    if not has_layout:
        if has_source_file:
            # Image was uploaded but analysis failed or is incomplete
            layout_status = (
                "CRITICAL: A floor plan image WAS uploaded and we CAN see it. "
                "The user shared a file with you. NEVER say 'can't see the image', 'can't see the uploaded image', 'I can't see it', or any variation. "
                "MANDATORY: Your first sentence MUST acknowledge the upload positively (e.g., 'Thanks for sharing your floor plan' or 'I can see you've uploaded your floor plan'). "
                "Your second sentence MUST ask for room details (e.g., 'Could you tell me about the different rooms and areas?'). "
                "The context will explicitly say 'A floor plan image WAS uploaded' - trust this and acknowledge it."
            )
        else:
            # No upload at all
            layout_status = (
                "We do not have a clear picture of their space (no layout uploaded). "
                "Do not start the sales discussion yet. If the user is asking about you (e.g. who are you, what do you do), answer that directly; only ask about their space when the conversation is about their home."
            )
    elif conf < 0.75:
        layout_status = "We have a layout but confidence is medium. First establish that we got it right (or ask them to confirm / add a bit more), then move to the sales discussion."
    else:
        layout_status = "We have a clear understanding of their space. You can acknowledge it naturally and then have a genuine sales conversation."

    context = (
        f"Customer first name: {name}. "
        f"Layout status: {layout_status} "
    )
    if has_source_file:
        context += (
            f"CRITICAL: A floor plan image WAS uploaded: {layout.get('source_filename', 'floor plan')}. "
            f"We CAN see it. The user shared this file with you. "
            f"You MUST acknowledge the upload in your first sentence. NEVER say you can't see it. "
        )
    context += (
        f"Layout type: {layout_type}. Confidence: {conf:.2f}. "
        f"Rooms we have: {room_list if room_list else 'none'}. Entry points: {entry_points}. "
    )
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
    system_prompt = system_base + "\n\n---\nContext (layout, recommendations, bundle, price — use when replying):\n" + context

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
