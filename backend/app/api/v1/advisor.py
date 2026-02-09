from __future__ import annotations

import json
import os
from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.core.logging import get_logger
from app.models.advisor import AdvisorChatRequest, AdvisorChatResponse
from app.repositories.crm_repo import CRMRepository
from app.repositories.product_repo import ProductRepository
from app.services.persona.persona_builder import build_persona
from app.services.recommendation.recommender import recommend
from app.services.recommendation.llm_recommender import recommend_with_llm_fallback
from app.services.llm.llm_openai import generate_advisor_response, _openai_client
from app.services.llm.llm_stub import stream_text

router = APIRouter()
logger = get_logger("api.advisor")

crm = CRMRepository()
prod = ProductRepository()

# Feature flag for LLM recommendations (default: enabled)
ENABLE_LLM_RECOMMENDATIONS = os.getenv("ENABLE_LLM_RECOMMENDATIONS", "true").lower() == "true"

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


def _normalize_llm_room(llm_room: dict, existing_room: dict | None = None) -> dict:
    """
    Normalize LLM room fields to match our layout schema and merge with existing room.
    
    LLM returns: {"room_id": "r1", "name": "...", "type": "bedroom", "width": 10, ...}
    Our schema:  {"room_id": "r1", "room": "...", "name": "...", "room_type": "bedroom", "width": 10, ...}
    
    When merging with an existing room:
    - LLM updates take priority for dimensions (width, length, area) and name changes
    - Existing room_type is preserved UNLESS LLM explicitly provides a different "type"
    - Existing room_id is always preserved
    """
    normalized = dict(llm_room)
    
    # Map LLM "type" -> "room_type" 
    if "type" in normalized:
        normalized["room_type"] = normalized.pop("type")
    
    # Ensure both "room" and "name" are set consistently
    llm_name = normalized.get("name") or normalized.get("room")
    if llm_name:
        normalized["room"] = llm_name
        normalized["name"] = llm_name
    
    if existing_room is None:
        # New room - ensure room_type defaults to "other" if missing
        normalized.setdefault("room_type", "other")
        return normalized
    
    # Merge with existing room:
    # Start with existing (preserves all user edits), then apply LLM changes
    merged = dict(existing_room)
    
    # LLM explicitly changed the name? Use it. Otherwise keep existing.
    existing_name = (existing_room.get("room") or existing_room.get("name") or "").lower().strip()
    llm_name_lower = (llm_name or "").lower().strip()
    if llm_name and llm_name_lower != existing_name:
        merged["room"] = llm_name
        merged["name"] = llm_name
    
    # LLM explicitly changed room_type? Use it. Otherwise keep existing.
    llm_room_type = normalized.get("room_type")
    if llm_room_type and llm_room_type != existing_room.get("room_type"):
        merged["room_type"] = llm_room_type
    
    # Always apply dimension updates from LLM (this is the primary reason for layout_updates)
    for dim_key in ("width", "length", "area", "height", "confidence"):
        if dim_key in normalized and normalized[dim_key] is not None:
            merged[dim_key] = normalized[dim_key]
    
    # Preserve critical existing fields that LLM shouldn't override
    merged["room_id"] = existing_room.get("room_id") or normalized.get("room_id")
    merged.setdefault("room_type", "other")
    
    return merged


def _merge_layout_updates(layout: dict, layout_updates: dict, layout_id: str) -> dict:
    """
    Merge LLM layout_updates into existing layout, preserving user edits.
    Returns the merged layout dict.
    """
    updated_layout = {**layout}
    
    if "rooms" in layout_updates:
        llm_rooms = layout_updates["rooms"]
        existing_rooms = layout.get("rooms", [])
        
        # Build lookup maps for existing rooms
        existing_by_id = {}
        existing_by_name = {}
        for r in existing_rooms:
            rid = r.get("room_id")
            if rid:
                existing_by_id[rid] = r
            rname = (r.get("name") or r.get("room") or "").lower().strip()
            if rname:
                existing_by_name[rname] = r
        
        merged_rooms = []
        processed_existing_ids = set()
        processed_existing_names = set()
        
        for llm_room in llm_rooms:
            llm_rid = llm_room.get("room_id")
            llm_rname = (llm_room.get("name") or llm_room.get("room", "")).lower().strip()
            
            existing = None
            
            # Match by room_id first
            if llm_rid and llm_rid in existing_by_id:
                existing = existing_by_id[llm_rid]
                processed_existing_ids.add(llm_rid)
                if existing.get("name") or existing.get("room"):
                    processed_existing_names.add(
                        (existing.get("name") or existing.get("room") or "").lower().strip()
                    )
            # Then match by name
            elif llm_rname and llm_rname in existing_by_name:
                existing = existing_by_name[llm_rname]
                processed_existing_names.add(llm_rname)
                if existing.get("room_id"):
                    processed_existing_ids.add(existing["room_id"])
            
            merged_rooms.append(_normalize_llm_room(llm_room, existing))
        
        # Preserve existing rooms that weren't matched by LLM
        for existing_room in existing_rooms:
            rid = existing_room.get("room_id")
            rname = (existing_room.get("name") or existing_room.get("room") or "").lower().strip()
            already_processed = (
                (rid and rid in processed_existing_ids) or
                (rname and rname in processed_existing_names)
            )
            if not already_processed:
                merged_rooms.append(existing_room)
        
        updated_layout["rooms"] = merged_rooms
        
        logger.info(
            "layout_merge: existing=%d llm_returned=%d final=%d",
            len(existing_rooms), len(llm_rooms), len(merged_rooms)
        )
    
    if "total_area" in layout_updates:
        updated_layout["total_area"] = layout_updates["total_area"]
    if "layout_type" in layout_updates:
        updated_layout["layout_type"] = layout_updates["layout_type"]
    
    # Preserve layout_id and other metadata
    updated_layout["layout_id"] = layout_id
    
    # Update cache
    _LAYOUT_STORE[layout_id] = updated_layout
    logger.info("layout_merge: stored layout_id=%s rooms=%d", layout_id, len(updated_layout.get("rooms", [])))
    
    return updated_layout


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


def _should_generate_recommendations(
    layout: dict,
    messages: list[dict[str, str]],
) -> bool:
    """
    Determine if recommendations should be generated.
    
    Recommendations are generated when:
    1. User explicitly asks for recommendations (keywords: "recommend", "suggest", "what do you recommend")
    2. Layout is confirmed (has rooms) AND user has expressed preferences (security, entertainment, wifi, etc.)
    3. Previous assistant action was "offer_plan" (updating existing plan)
    
    Returns True if recommendations should be generated, False otherwise.
    """
    if not messages:
        return False
    
    # Check last few user messages for explicit recommendation requests
    recommendation_keywords = [
        "recommend", "suggest", "what do you", "what should", "what would",
        "show me", "give me", "tell me about", "options", "products"
    ]
    
    # Check last 3 user messages
    recent_user_messages = [
        msg.get("content", "").lower()
        for msg in messages[-6:]  # Check last 6 messages (3 turns)
        if msg.get("role") == "user"
    ]
    
    for msg in recent_user_messages:
        if any(keyword in msg for keyword in recommendation_keywords):
            logger.debug("Recommendations needed: user explicitly asked for recommendations")
            return True
    
    # Check if layout is confirmed (has rooms)
    has_layout = bool(layout.get("rooms"))
    if not has_layout:
        logger.debug("Recommendations skipped: no layout confirmed")
        return False
    
    # Check if user has expressed preferences (with typo tolerance)
    preference_keywords = {
        "security": ["security", "safe", "secure", "camera", "lock", "monitor", "protect"],
        "entertainment": ["streaming", "streamin", "stream", "tv", "entertainment", "netflix", "watch", "movie", "show", "entertain"],
        "wifi": ["wifi", "wi-fi", "wi fi", "internet", "connection", "network", "coverage", "signal", "strong wifi", "strong wifi", "powerful wifi"],
        "budget": ["budget", "cheap", "affordable", "cost", "price", "expensive"],
        "convenience": ["easy", "simple", "convenient", "automate", "smart"]
    }
    
    has_preferences = False
    for category, keywords in preference_keywords.items():
        for msg in recent_user_messages:
            if any(keyword in msg for keyword in keywords):
                has_preferences = True
                logger.debug("Recommendations needed: user expressed %s preferences", category)
                break
        if has_preferences:
            break
    
    if has_preferences:
        return True
    
    # Check if previous assistant action was "offer_plan" (updating existing plan)
    # Look for assistant messages that mention products or prices (indicating plan was offered)
    recent_assistant_messages = [
        msg.get("content", "").lower()
        for msg in messages[-4:]
        if msg.get("role") == "assistant"
    ]
    
    plan_indicators = ["aed", "month", "bundle", "mesh", "camera", "lock", "recommend"]
    for msg in recent_assistant_messages:
        if any(indicator in msg for indicator in plan_indicators):
            logger.debug("Recommendations needed: updating existing plan")
            return True
    
    logger.debug("Recommendations skipped: layout confirmed but no preferences expressed yet")
    return False


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

    # Only generate recommendations when needed (optimization)
    messages_for_llm = [{"role": m.role, "content": m.content} for m in (req.messages or [])]
    llm_client = _openai_client()
    
    should_gen_recos = _should_generate_recommendations(layout, messages_for_llm)
    
    if should_gen_recos:
        logger.debug("advisor/chat generating recommendations (user asked or preferences expressed)")
        try:
            recos, bundle_id, est_monthly = recommend_with_llm_fallback(
                profile=profile,
                layout=layout,
                product_map=product_map,
                bundles=bundles,
                conversation_history=messages_for_llm,
                llm_client=llm_client,
                enable_llm=ENABLE_LLM_RECOMMENDATIONS,
            )
        except Exception as e:
            logger.warning("LLM recommendation failed, using rule-based fallback: %s", e, exc_info=True)
            # Fallback to rule-based
            recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
        logger.debug("advisor/chat recos=%d bundle_id=%s est_monthly=%s", len(recos), bundle_id, est_monthly)
    else:
        # Skip recommendation generation - advisor will respond conversationally without products
        logger.debug("advisor/chat skipping recommendations (not needed yet)")
        recos, bundle_id, est_monthly = [], None, None

    product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}

    result = generate_advisor_response(
        persona={"name": profile.get("name"), **persona_obj.model_dump()},
        layout=layout,
        messages=messages_for_llm,
        recos=[r.model_dump() for r in recos],
        bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        product_names=product_names,
        profile=profile,
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured.",
        )
    reply, action, layout_updates = result

    # CRITICAL: If advisor wants to offer plan but we skipped recommendations, generate them now
    # This ensures LLM always has actual recommendations to use (not hallucinated products)
    if action == "offer_plan" and not recos:
        logger.warning("advisor/chat advisor wants to offer plan but no recommendations exist - generating now")
        try:
            recos, bundle_id, est_monthly = recommend_with_llm_fallback(
                profile=profile,
                layout=layout,
                product_map=product_map,
                bundles=bundles,
                conversation_history=messages_for_llm,
                llm_client=llm_client,
                enable_llm=ENABLE_LLM_RECOMMENDATIONS,
            )
            logger.info("advisor/chat generated recommendations on-demand: recos=%d bundle_id=%s", len(recos), bundle_id)
        except Exception as e:
            logger.warning("On-demand recommendation generation failed, using rule-based: %s", e, exc_info=True)
            recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
        
        # Re-generate advisor response with actual recommendations
        product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}
        result = generate_advisor_response(
            persona={"name": profile.get("name"), **persona_obj.model_dump()},
            layout=layout,
            messages=messages_for_llm,
            recos=[r.model_dump() for r in recos],
            bundle_id=bundle_id,
            estimated_monthly=est_monthly,
            product_names=product_names,
            profile=profile,
        )
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured.",
            )
        reply, action, layout_updates = result

    # Merge LLM layout updates if present
    if layout_updates and req.layout_id:
        layout = _merge_layout_updates(layout, layout_updates, req.layout_id)

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

    # Only generate recommendations when needed (optimization)
    messages_for_llm = [{"role": m.role, "content": m.content} for m in (req.messages or [])]
    llm_client = _openai_client()
    
    should_gen_recos = _should_generate_recommendations(layout, messages_for_llm)
    
    if should_gen_recos:
        logger.debug("advisor/chat/stream generating recommendations (user asked or preferences expressed)")
        try:
            recos, bundle_id, est_monthly = recommend_with_llm_fallback(
                profile=profile,
                layout=layout,
                product_map=product_map,
                bundles=bundles,
                conversation_history=messages_for_llm,
                llm_client=llm_client,
                enable_llm=ENABLE_LLM_RECOMMENDATIONS,
            )
        except Exception as e:
            logger.warning("LLM recommendation failed, using rule-based fallback: %s", e, exc_info=True)
            # Fallback to rule-based
            recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
        logger.debug("advisor/chat/stream recos=%d bundle_id=%s est_monthly=%s", len(recos), bundle_id, est_monthly)
    else:
        # Skip recommendation generation - advisor will respond conversationally without products
        logger.debug("advisor/chat/stream skipping recommendations (not needed yet)")
        recos, bundle_id, est_monthly = [], None, None
    
    product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}

    result = generate_advisor_response(
        persona={"name": profile.get("name"), **persona_obj.model_dump()},
        layout=layout,
        messages=messages_for_llm,
        recos=[r.model_dump() for r in recos],
        bundle_id=bundle_id,
        estimated_monthly=est_monthly,
        product_names=product_names,
        profile=profile,
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured.",
        )
    reply, action, layout_updates = result

    # CRITICAL: If advisor wants to offer plan but we skipped recommendations, generate them now
    # This ensures LLM always has actual recommendations to use (not hallucinated products)
    if action == "offer_plan" and not recos:
        logger.warning("advisor/chat/stream advisor wants to offer plan but no recommendations exist - generating now")
        try:
            recos, bundle_id, est_monthly = recommend_with_llm_fallback(
                profile=profile,
                layout=layout,
                product_map=product_map,
                bundles=bundles,
                conversation_history=messages_for_llm,
                llm_client=llm_client,
                enable_llm=ENABLE_LLM_RECOMMENDATIONS,
            )
            logger.info("advisor/chat/stream generated recommendations on-demand: recos=%d bundle_id=%s", len(recos), bundle_id)
        except Exception as e:
            logger.warning("On-demand recommendation generation failed, using rule-based: %s", e, exc_info=True)
            recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
        
        # Re-generate advisor response with actual recommendations
        product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}
        result = generate_advisor_response(
            persona={"name": profile.get("name"), **persona_obj.model_dump()},
            layout=layout,
            messages=messages_for_llm,
            recos=[r.model_dump() for r in recos],
            bundle_id=bundle_id,
            estimated_monthly=est_monthly,
            product_names=product_names,
            profile=profile,
        )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured.",
        )
    reply, action, layout_updates = result

    # CRITICAL: If advisor wants to offer plan but we skipped recommendations, generate them now
    # This ensures LLM always has actual recommendations to use (not hallucinated products)
    if action == "offer_plan" and not recos:
        logger.warning("advisor/chat/stream advisor wants to offer plan but no recommendations exist - generating now")
        try:
            recos, bundle_id, est_monthly = recommend_with_llm_fallback(
                profile=profile,
                layout=layout,
                product_map=product_map,
                bundles=bundles,
                conversation_history=messages_for_llm,
                llm_client=llm_client,
                enable_llm=ENABLE_LLM_RECOMMENDATIONS,
            )
            logger.info("advisor/chat/stream generated recommendations on-demand: recos=%d bundle_id=%s", len(recos), bundle_id)
        except Exception as e:
            logger.warning("On-demand recommendation generation failed, using rule-based: %s", e, exc_info=True)
            recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)
        
        # Re-generate advisor response with actual recommendations
        product_names = {pid: p.get("name", pid) for pid, p in product_map.items()}
        result = generate_advisor_response(
            persona={"name": profile.get("name"), **persona_obj.model_dump()},
            layout=layout,
            messages=messages_for_llm,
            recos=[r.model_dump() for r in recos],
            bundle_id=bundle_id,
            estimated_monthly=est_monthly,
            product_names=product_names,
            profile=profile,
        )
        if result is None:
            raise HTTPException(
                status_code=503,
                detail="Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured.",
            )
        reply, action, layout_updates = result

    # Merge LLM layout updates if present (same logic as non-streaming endpoint)
    if layout_updates and req.layout_id:
        layout = _merge_layout_updates(layout, layout_updates, req.layout_id)

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
