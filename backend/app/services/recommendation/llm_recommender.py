"""
LLM-powered product recommendation engine with fallback to rule-based recommender.
"""
from __future__ import annotations
import json
import re
from typing import Dict, Any, List, Tuple, Optional
from app.models.advisor import RecommendationItem
from app.core.config import settings
from app.core.prompts import get_prompt
from app.core.logging import get_logger
from app.services.recommendation.rag_retriever import retrieve_relevant_knowledge

logger = get_logger("llm_recommender")


def recommend_with_llm_fallback(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    product_map: Dict[str, Any],
    bundles: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]],
    llm_client,
    enable_llm: bool = True,
) -> Tuple[List[RecommendationItem], Optional[str], Optional[float]]:
    """
    Try LLM to generate recommendations, fallback to rule-based if fails.
    
    Args:
        profile: Customer profile dict
        layout: Layout analysis dict
        product_map: Dict of product_id -> product details
        bundles: List of bundle dicts
        conversation_history: List of conversation messages
        llm_client: OpenAI client instance
        enable_llm: Feature flag to enable/disable LLM recommendations
    
    Returns:
        Tuple of (recommendations, bundle_id, estimated_monthly)
    """
    if not enable_llm or llm_client is None:
        logger.debug("LLM recommendations disabled or client unavailable, using rule-based")
        return _fallback_to_rule_based(profile, layout, product_map, bundles)
    
    # Try LLM first
    llm_result = _try_llm_recommendations(
        profile, layout, product_map, bundles, conversation_history, llm_client
    )
    
    if llm_result is not None:
        # Validate LLM recommendations
        validated = _validate_recommendations(llm_result, product_map, layout)
        if validated:
            logger.info(
                "Using LLM-generated recommendations: count=%d bundle=%s monthly=%.0f",
                len(validated[0]),
                validated[1],
                validated[2] or 0,
            )
            return validated
        else:
            logger.warning("LLM recommendations failed validation, falling back to rule-based")
    
    # Fallback to rule-based
    logger.info("Falling back to rule-based recommendations")
    return _fallback_to_rule_based(profile, layout, product_map, bundles)


def _try_llm_recommendations(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    product_map: Dict[str, Any],
    bundles: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]],
    llm_client,
) -> Optional[Tuple[List[RecommendationItem], Optional[str], Optional[float]]]:
    """
    Ask LLM to generate recommendations. Returns None if fails.
    """
    try:
        # Load prompt
        prompt_base = get_prompt("recommender_system")
        if not prompt_base:
            logger.warning("recommender_system prompt not found, falling back to rule-based")
            return None
        
        # RAG: Retrieve relevant knowledge before LLM call
        logger.debug("Retrieving relevant knowledge (RAG)")
        retrieved_knowledge = retrieve_relevant_knowledge(
            profile, layout, product_map, conversation_history
        )
        
        # Build context
        context = _build_recommender_context(profile, layout, product_map, bundles, conversation_history)
        
        # Combine prompt + RAG knowledge + context
        system_prompt = prompt_base
        if retrieved_knowledge:
            system_prompt += "\n\n---\nRetrieved Knowledge (RAG):\n" + retrieved_knowledge
        system_prompt += "\n\n---\nContext:\n" + context
        
        # Call LLM
        logger.debug("Calling LLM for recommendations")
        model_name = settings.ollama_chat_model if settings.llm_provider == "ollama" else settings.openai_chat_model
        response = llm_client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": system_prompt}],
            response_format={"type": "json_object"},
            max_tokens=1000,
            temperature=0.3,  # Lower temperature for more deterministic recommendations
        )
        
        raw = response.choices[0].message.content.strip()
        if not raw:
            logger.warning("LLM returned empty response")
            return None
        
        # Parse JSON (handle markdown code blocks)
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw)
            raw = raw.strip()
        
        data = json.loads(raw)
        
        # Parse recommendations
        recos = []
        for r in data.get("recommendations", []):
            recos.append(
                RecommendationItem(
                    room=r.get("room", ""),
                    product_id=r.get("product_id", ""),
                    why=r.get("why", ""),
                )
            )
        
        bundle_id = data.get("bundle_id")
        estimated_monthly = data.get("estimated_monthly")
        
        # Recalculate monthly if bundle_id provided (trust bundle price)
        if bundle_id:
            for b in bundles:
                if b.get("bundle_id") == bundle_id:
                    estimated_monthly = float(b.get("bundle_monthly", 0))
                    break
        
        return (recos, bundle_id, estimated_monthly)
        
    except json.JSONDecodeError as e:
        logger.warning("LLM returned invalid JSON: %s", e)
        return None
    except Exception as e:
        logger.warning("LLM recommendation generation failed: %s", e, exc_info=True)
        return None


def _build_recommender_context(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    product_map: Dict[str, Any],
    bundles: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]],
) -> str:
    """Build context string for LLM recommender."""
    parts = []
    
    # Customer Profile
    parts.append("Customer Profile:")
    parts.append(f"- Customer ID: {profile.get('customer_id', 'Unknown')}")
    parts.append(f"- Segment: {profile.get('segment', 'Unknown')}")
    
    # Revenue information
    revenue = profile.get("revenue", {})
    if revenue:
        monthly_revenue = revenue.get("monthly_aed", 0)
        annual_revenue = revenue.get("annual_aed", 0)
        if monthly_revenue > 0:
            parts.append(f"- Monthly Revenue: {monthly_revenue} AED")
        if annual_revenue > 0:
            parts.append(f"- Annual Revenue: {annual_revenue} AED")
    
    # Account age
    account_age = profile.get("account_age_years")
    if account_age:
        parts.append(f"- Account Age: {account_age:.1f} years")
    
    # Contract and payment info
    contract_type = profile.get("contract_type")
    if contract_type:
        parts.append(f"- Contract Type: {contract_type}")
    payment_method = profile.get("payment_method")
    if payment_method:
        parts.append(f"- Payment Method: {payment_method}")
    
    # Existing devices
    devices = profile.get("devices", [])
    if devices:
        device_list = []
        for device in devices:
            device_type = device.get("type", "unknown")
            brand = device.get("brand", "")
            model = device.get("model", "")
            device_str = device_type
            if brand:
                device_str += f" ({brand}"
                if model:
                    device_str += f" {model}"
                device_str += ")"
            device_list.append(device_str)
        parts.append(f"- Existing Devices: {', '.join(device_list)}")
    
    # Previous purchases
    previous_purchases = profile.get("previous_purchases", [])
    if previous_purchases:
        parts.append(f"- Previous Purchases: {', '.join(previous_purchases)}")
    
    # Usage patterns
    usage = profile.get("usage", {})
    if usage:
        usage_parts = []
        if usage.get("security_sensitive"):
            usage_parts.append("security_sensitive")
        if usage.get("streaming_heavy"):
            usage_parts.append("streaming_heavy")
        if usage.get("work_from_home"):
            usage_parts.append("work_from_home")
        if usage.get("gaming"):
            usage_parts.append("gaming")
        if usage_parts:
            parts.append(f"- Usage: {', '.join(usage_parts)}")
    
    # Layout Information
    parts.append("\nLayout Information:")
    parts.append(f"- Layout Type: {layout.get('layout_type', 'unknown')}")
    rooms = layout.get("rooms", [])
    if rooms:
        room_list = []
        for room in rooms:
            name = room.get("name", "Unknown")
            area = room.get("area")
            dims = []
            if room.get("width") and room.get("length"):
                dims.append(f"{room.get('width')}×{room.get('length')} ft")
            if area:
                dims.append(f"{area} sq ft")
            room_str = f"{name}"
            if dims:
                room_str += f" ({', '.join(dims)})"
            room_list.append(room_str)
        parts.append(f"- Rooms: {', '.join(room_list)}")
    else:
        parts.append("- Rooms: None detected")
    
    total_area = layout.get("total_area")
    if total_area:
        parts.append(f"- Total Area: {total_area}")
    
    entry_points = layout.get("entry_points", [])
    if entry_points:
        parts.append(f"- Entry Points: {', '.join(entry_points)}")
    
    # Product Catalog
    parts.append("\nAvailable Products:")
    for pid, p in product_map.items():
        name = p.get("name", pid)
        price = p.get("price_monthly", 0)
        category = p.get("category", "")
        notes = p.get("notes", "")
        compatibility = p.get("compatibility", [])
        compat_str = f" ({', '.join(compatibility)})" if compatibility else ""
        parts.append(f"- {pid}: {name} ({price} AED/month, {category}){compat_str}")
        if notes:
            parts.append(f"  Notes: {notes}")
    
    # Bundles
    parts.append("\nAvailable Bundles:")
    for b in bundles:
        bundle_id = b.get("bundle_id", "")
        name = b.get("name", "")
        items = b.get("items", [])
        monthly = b.get("bundle_monthly", 0)
        notes = b.get("bundle_notes", "")
        parts.append(f"- {bundle_id}: {name}")
        parts.append(f"  Items: {', '.join(items)}")
        parts.append(f"  Monthly: {monthly} AED")
        if notes:
            parts.append(f"  Notes: {notes}")
    
    # Conversation History (last 3 messages for context)
    if conversation_history:
        parts.append("\nRecent Conversation:")
        recent = conversation_history[-3:]  # Last 3 messages
        for msg in recent:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if content:
                preview = content[:200] + "..." if len(content) > 200 else content
                parts.append(f"- {role}: {preview}")
    
    return "\n".join(parts)


def _validate_recommendations(
    recos_data: Tuple[List[RecommendationItem], Optional[str], Optional[float]],
    product_map: Dict[str, Any],
    layout: Dict[str, Any],
) -> Optional[Tuple[List[RecommendationItem], Optional[str], Optional[float]]]:
    """
    Validate LLM recommendations. Returns None if invalid.
    """
    recos, bundle_id, est_monthly = recos_data
    
    if not recos:
        logger.warning("LLM returned no recommendations")
        return None
    
    # Validate each recommendation
    valid_recos = []
    rooms = layout.get("rooms", [])
    room_names = {room.get("name", "").lower() for room in rooms}
    special_rooms = {"whole home", "entrance", "perimeter"}
    
    for r in recos:
        # Check product_id exists
        if r.product_id not in product_map:
            logger.warning("LLM recommended invalid product_id: %s", r.product_id)
            continue
        
        # Check room name (allow special rooms or actual room names)
        room_lower = r.room.lower()
        if room_lower not in room_names and room_lower not in special_rooms:
            logger.debug("LLM recommended product for room not in layout: %s (allowing)", r.room)
            # Still allow it - might be a valid room name variation
        
        # Validate "why" is not empty
        if not r.why or not r.why.strip():
            logger.warning("LLM recommendation missing 'why' for %s", r.product_id)
            r.why = "Recommended for this space."
        
        valid_recos.append(r)
    
    # Must have at least one valid recommendation
    if not valid_recos:
        logger.warning("No valid recommendations after validation")
        return None
    
    # Validate bundle_id if provided
    if bundle_id:
        # Bundle validation would go here if needed
        pass
    
    # Recalculate estimated_monthly if needed
    if est_monthly is None or est_monthly <= 0:
        # Calculate from products
        monthly = 0.0
        seen = set()
        for r in valid_recos:
            if r.product_id in seen:
                continue
            seen.add(r.product_id)
            p = product_map.get(r.product_id, {})
            monthly += float(p.get("price_monthly") or 0.0)
        est_monthly = monthly
    
    return (valid_recos, bundle_id, est_monthly)


def _fallback_to_rule_based(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    product_map: Dict[str, Any],
    bundles: List[Dict[str, Any]],
) -> Tuple[List[RecommendationItem], Optional[str], Optional[float]]:
    """Fallback to rule-based recommender."""
    from app.services.recommendation.recommender import recommend
    
    return recommend(profile, layout, product_map, bundles)
