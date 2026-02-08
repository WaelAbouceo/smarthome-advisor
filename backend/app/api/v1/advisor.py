from __future__ import annotations

import json
import os
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.config import settings  # noqa: F401 — ensures .env is loaded before reading LLM_PROVIDER
from app.core.logging import get_logger
from app.models.advisor import AdvisorChatRequest, AdvisorChatResponse
from app.repositories.crm_repo import CRMRepository
from app.repositories.product_repo import ProductRepository
from app.services.persona.persona_builder import build_persona
from app.services.recommendation.recommender import recommend
from app.services.llm.llm_stub import stream_text

# LLM Model Selection - Set LLM_PROVIDER env var to "ollama" or "openai"
_LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").lower()
if _LLM_PROVIDER == "ollama":
    from app.services.llm.llm_ollama import generate_advisor_response
else:
    from app.services.llm.llm_openai import generate_advisor_response

router = APIRouter()
logger = get_logger("api.advisor")

crm = CRMRepository()
prod = ProductRepository()

# In-memory demo store for layouts analyzed (layout_id -> layout dict)
_LAYOUT_STORE: dict[str, dict] = {}

@router.post("/layout_cache/upsert")
def upsert_layout_cache(layout: dict):
    lid = layout.get("layout_id")
    if not lid:
        logger.warning("layout_cache/upsert missing layout_id")
        raise HTTPException(status_code=400, detail="layout_id is required")
    rooms_count = len(layout.get("rooms", []))
    conf = layout.get("layout_confidence") or layout.get("confidence", 0)
    _LAYOUT_STORE[lid] = layout
    logger.info("layout_cache/upsert layout_id=%s rooms=%d confidence=%.2f stored", lid, rooms_count, conf)
    return {"ok": True, "layout_id": lid}

def _last_user_message(messages):
    """Accept list of ChatMessage (Pydantic) or dicts."""
    for m in reversed(messages or []):
        if isinstance(m, dict):
            role, content = m.get("role"), (m.get("content") or "").strip()
        else:
            role = getattr(m, "role", None)
            content = (getattr(m, "content", None) or "").strip()
        if role == "user" and content:
            return content
    return None


def _safe_log_text(s: str, max_len: int) -> str:
    """Avoid logging base64 image data (data: URLs) or huge content."""
    s = s or ""
    if s.startswith("data:"):
        return f"[omitted {len(s)} chars - image/binary]"
    if len(s) <= max_len:
        return s
    return s[:max_len] + "..."


def _log_conversation(last_user: str | None, reply: str, action: str) -> None:
    inp = _safe_log_text((last_user or "(uploaded layout)"), 200)
    out = _safe_log_text(reply, 300)
    logger.info("--- Advisor ---\n  In:  %s\n  Out: %s\n  Action: %s", inp, out, action)


@router.post("/chat")
def advisor_chat(req: AdvisorChatRequest):
    profile = crm.get_profile(req.customer_id)
    if not profile:
        logger.warning("advisor/chat customer not found customer_id=%s", req.customer_id)
        raise HTTPException(status_code=404, detail="Customer not found")

    persona_obj = build_persona(profile)
    catalog = prod.get_catalog()
    product_map = prod.get_product_map()
    bundles = catalog.get("bundles", [])

    layout = {}
    if req.layout_id:
        layout = _LAYOUT_STORE.get(req.layout_id, {})
        if not layout:
            logger.warning("advisor/chat layout_id not in cache layout_id=%s available_ids=%s", req.layout_id, list(_LAYOUT_STORE.keys())[:5])
            raise HTTPException(status_code=404, detail="layout_id not found in cache (call /layout/analyze then /advisor/layout_cache/upsert)")
        else:
            rooms_count = len(layout.get("rooms", []))
            conf = layout.get("layout_confidence") or layout.get("confidence", 0)
            logger.debug("advisor/chat layout found layout_id=%s rooms=%d confidence=%.2f", req.layout_id, rooms_count, conf)

    recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
    logger.debug("advisor/chat recos=%d bundle_id=%s est_monthly=%s", len(recos), bundle_id, est_monthly)

    product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}
    messages_for_llm = [{"role": m.role, "content": m.content} for m in (req.messages or [])]

    result = generate_advisor_response(
        persona={"name": profile.get("name"), **persona_obj.model_dump()},
        layout=layout,
        messages=messages_for_llm,
        recos=[r.model_dump() for r in recos],
        bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        product_names=product_names,
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail=f"Advisor is temporarily unavailable. Please check {'OLLAMA_BASE_URL and Ollama server connectivity' if _LLM_PROVIDER == 'ollama' else 'OPENAI_API_KEY is configured'}.",
        )
    reply, action, layout_updates = result

    # Merge LLM layout updates if present
    if layout_updates and req.layout_id:
        updated_layout = {**layout}  # Preserve existing layout
        
        if "rooms" in layout_updates:
            # Intelligent merge: LLM should return ALL rooms (existing + new/updated)
            # But if LLM only returns new rooms, merge them with existing
            llm_rooms = layout_updates["rooms"]
            existing_rooms = layout.get("rooms", [])
            
            if len(llm_rooms) >= len(existing_rooms):
                # LLM returned full list (or more) - use it
                updated_layout["rooms"] = llm_rooms
            else:
                # LLM returned only new/updated rooms - merge intelligently
                # Match by room_id or name, add new ones
                existing_by_id = {r.get("room_id"): r for r in existing_rooms if r.get("room_id")}
                existing_by_name = {r.get("name", r.get("room", "")).lower(): r for r in existing_rooms}
                
                merged_rooms = []
                processed_ids = set()
                
                # First, add/update rooms from LLM
                for llm_room in llm_rooms:
                    room_id = llm_room.get("room_id")
                    room_name = (llm_room.get("name") or llm_room.get("room", "")).lower()
                    
                    if room_id and room_id in existing_by_id:
                        # Update existing room by ID
                        merged_rooms.append({**existing_by_id[room_id], **llm_room})
                        processed_ids.add(room_id)
                    elif room_name and room_name in existing_by_name:
                        # Update existing room by name
                        existing = existing_by_name[room_name]
                        merged_rooms.append({**existing, **llm_room})
                        if existing.get("room_id"):
                            processed_ids.add(existing["room_id"])
                    else:
                        # New room - add it
                        merged_rooms.append(llm_room)
                
                # Then, preserve existing rooms that weren't updated
                for existing_room in existing_rooms:
                    room_id = existing_room.get("room_id")
                    if room_id and room_id not in processed_ids:
                        merged_rooms.append(existing_room)
                
                updated_layout["rooms"] = merged_rooms
            
            logger.info(
                "advisor/chat merged rooms: existing=%d llm_returned=%d final=%d",
                len(existing_rooms), len(llm_rooms), len(updated_layout["rooms"])
            )
        
        if "total_area" in layout_updates:
            updated_layout["total_area"] = layout_updates["total_area"]
        if "layout_type" in layout_updates:
            updated_layout["layout_type"] = layout_updates["layout_type"]
        # Preserve layout_id and other fields
        updated_layout["layout_id"] = req.layout_id
        # Update cache
        _LAYOUT_STORE[req.layout_id] = updated_layout
        logger.info("advisor/chat merged LLM layout_updates layout_id=%s rooms=%d", req.layout_id, len(updated_layout.get("rooms", [])))
        layout = updated_layout

    _log_conversation(_last_user_message(req.messages), reply, action)
    response = AdvisorChatResponse(
        answer=reply,
        persona={"profile": profile, "persona": persona_obj.model_dump()},
        layout=layout,
        recommended_products=recos,
        recommended_bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        action=action,
    )
    return response.model_dump()

@router.post("/chat/stream")
def advisor_chat_stream(req: AdvisorChatRequest):
    """
    SSE stream: emits {"partial_content": "..."} then {"end_of_stream": true, "final": {...}}.
    """
    profile = crm.get_profile(req.customer_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Customer not found")

    persona_obj = build_persona(profile)
    catalog = prod.get_catalog()
    product_map = prod.get_product_map()
    bundles = catalog.get("bundles", [])
    layout = {}
    if req.layout_id:
        layout = _LAYOUT_STORE.get(req.layout_id, {})
        if not layout:
            raise HTTPException(status_code=404, detail="layout_id not found in cache")
        else:
            rooms_count = len(layout.get("rooms", []))
            conf = layout.get("layout_confidence") or layout.get("confidence", 0)
            source_file = layout.get("source_filename", "none")
            logger.info(
                "advisor/chat/stream layout found layout_id=%s rooms=%d confidence=%.2f source_filename=%s",
                req.layout_id, rooms_count, conf, source_file
            )

    recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
    product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}
    messages_for_llm = [{"role": m.role, "content": m.content} for m in (req.messages or [])]

    result = generate_advisor_response(
        persona={"name": profile.get("name"), **persona_obj.model_dump()},
        layout=layout,
        messages=messages_for_llm,
        recos=[r.model_dump() for r in recos],
        bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        product_names=product_names,
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail=f"Advisor is temporarily unavailable. Please check {'OLLAMA_BASE_URL and Ollama server connectivity' if _LLM_PROVIDER == 'ollama' else 'OPENAI_API_KEY is configured'}.",
        )
    reply, action, layout_updates = result

    # Merge LLM layout updates if present (same logic as non-streaming endpoint)
    if layout_updates and req.layout_id:
        updated_layout = {**layout}  # Preserve existing layout
        
        if "rooms" in layout_updates:
            # Intelligent merge: LLM should return ALL rooms (existing + new/updated)
            # But if LLM only returns new rooms, merge them with existing
            llm_rooms = layout_updates["rooms"]
            existing_rooms = layout.get("rooms", [])
            
            if len(llm_rooms) >= len(existing_rooms):
                # LLM returned full list (or more) - use it
                updated_layout["rooms"] = llm_rooms
            else:
                # LLM returned only new/updated rooms - merge intelligently
                # Match by room_id or name, add new ones
                existing_by_id = {r.get("room_id"): r for r in existing_rooms if r.get("room_id")}
                existing_by_name = {r.get("name", r.get("room", "")).lower(): r for r in existing_rooms}
                
                merged_rooms = []
                processed_ids = set()
                
                # First, add/update rooms from LLM
                for llm_room in llm_rooms:
                    room_id = llm_room.get("room_id")
                    room_name = (llm_room.get("name") or llm_room.get("room", "")).lower()
                    
                    if room_id and room_id in existing_by_id:
                        # Update existing room by ID
                        merged_rooms.append({**existing_by_id[room_id], **llm_room})
                        processed_ids.add(room_id)
                    elif room_name and room_name in existing_by_name:
                        # Update existing room by name
                        existing = existing_by_name[room_name]
                        merged_rooms.append({**existing, **llm_room})
                        if existing.get("room_id"):
                            processed_ids.add(existing["room_id"])
                    else:
                        # New room - add it
                        merged_rooms.append(llm_room)
                
                # Then, preserve existing rooms that weren't updated
                for existing_room in existing_rooms:
                    room_id = existing_room.get("room_id")
                    if room_id and room_id not in processed_ids:
                        merged_rooms.append(existing_room)
                
                updated_layout["rooms"] = merged_rooms
            
            logger.info(
                "advisor/chat/stream merged rooms: existing=%d llm_returned=%d final=%d",
                len(existing_rooms), len(llm_rooms), len(updated_layout["rooms"])
            )
        
        if "total_area" in layout_updates:
            updated_layout["total_area"] = layout_updates["total_area"]
        if "layout_type" in layout_updates:
            updated_layout["layout_type"] = layout_updates["layout_type"]
        # Preserve layout_id and other fields
        updated_layout["layout_id"] = req.layout_id
        # Update cache
        _LAYOUT_STORE[req.layout_id] = updated_layout
        logger.info("advisor/chat/stream merged LLM layout_updates layout_id=%s rooms=%d", req.layout_id, len(updated_layout.get("rooms", [])))
        layout = updated_layout

    _log_conversation(_last_user_message(req.messages), reply, action)
    final = AdvisorChatResponse(
        answer=reply,
        persona={"profile": profile, "persona": persona_obj.model_dump()},
        layout=layout,
        recommended_products=recos,
        recommended_bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        action=action,
    ).model_dump()

    def event_gen():
        for chunk in stream_text(reply, chunk_size=36, delay_s=0.01):
            yield {"event": "message", "data": json.dumps({"partial_content": chunk})}
        yield {"event": "message", "data": json.dumps({"end_of_stream": True, "final": final})}

    return EventSourceResponse(event_gen())
