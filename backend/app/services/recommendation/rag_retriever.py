"""
RAG (Retrieval-Augmented Generation) for product recommendations.
Retrieves relevant product knowledge, best practices, and use cases before LLM call.
"""
from __future__ import annotations
from typing import Dict, Any, List
from app.core.logging import get_logger

logger = get_logger("rag_retriever")


# Knowledge base: Product use cases, best practices, and recommendations
PRODUCT_KNOWLEDGE_BASE = {
    "P_WIFI_MESH_01": {
        "use_cases": [
            "Multi-room coverage for streaming and work",
            "Large homes (>2000 sq ft) need mesh for consistent coverage",
            "Homes with 5+ rooms benefit from mesh systems",
            "Essential for work-from-home setups",
            "Required for 4K streaming without buffering",
        ],
        "room_recommendations": {
            "large_living": "Place primary node in living room for best coverage",
            "multi_floor": "One node per floor recommended",
            "office": "Ensure office has strong signal for video calls",
        },
        "compatibility_notes": {
            "apartment": "Single mesh node usually sufficient for apartments",
            "villa": "May need 2-3 nodes for full coverage",
            "office": "Multiple nodes for conference rooms and workspaces",
        },
    },
    "P_CAM_INDOOR_01": {
        "use_cases": [
            "Monitor entrances and main living areas",
            "Keep an eye on children or elderly family members",
            "Security for ground floor apartments",
            "Motion alerts for unexpected activity",
        ],
        "room_recommendations": {
            "entrance": "Best placement for entry monitoring",
            "living_room": "Central location for main area coverage",
            "master_bedroom": "For family safety monitoring",
            "kids_room": "For child safety (with privacy considerations)",
        },
        "best_for": [
            "Security-conscious families",
            "Homes with elderly residents",
            "Ground floor apartments",
            "Homes with valuable items",
        ],
    },
    "P_CAM_OUTDOOR_01": {
        "use_cases": [
            "Gate and perimeter security for villas",
            "Garden and driveway monitoring",
            "Outdoor area surveillance",
            "Weatherproof outdoor monitoring",
        ],
        "room_recommendations": {
            "perimeter": "Gate and fence monitoring",
            "garden": "Garden and outdoor area coverage",
            "driveway": "Vehicle and entrance monitoring",
        },
        "best_for": [
            "Villas with outdoor spaces",
            "Homes with gates or fences",
            "Properties with gardens or driveways",
        ],
        "requirements": ["villa", "outdoor_space"],
    },
    "P_SMART_LOCK_01": {
        "use_cases": [
            "Keyless entry convenience",
            "Enhanced security for main entry",
            "Remote access control",
            "Guest access management",
        ],
        "room_recommendations": {
            "entrance": "Primary entry point",
            "front_door": "Main entrance",
        },
        "best_for": [
            "Security-focused customers",
            "Families with multiple members",
            "Homes with frequent guests",
            "Rental properties",
        ],
    },
    "P_TV_BOX_01": {
        "use_cases": [
            "4K streaming for entertainment",
            "IPTV and live TV access",
            "Smart TV features",
            "Family entertainment hub",
        ],
        "room_recommendations": {
            "living_room": "Primary entertainment area",
            "family_room": "Family gathering space",
            "master_bedroom": "Personal entertainment",
        },
        "best_for": [
            "Streaming-heavy households",
            "Entertainment-focused families",
            "Homes with large TVs",
        ],
        "requirements": ["stable_wifi"],
    },
}

# Best practices by layout type
LAYOUT_BEST_PRACTICES = {
    "apartment": {
        "priorities": [
            "Compact coverage (single mesh node usually sufficient)",
            "Indoor security (no outdoor cameras)",
            "Space-efficient solutions",
        ],
        "common_rooms": ["living", "bedroom", "kitchen", "bathroom"],
        "recommended_products": ["P_WIFI_MESH_01", "P_CAM_INDOOR_01", "P_SMART_LOCK_01"],
    },
    "villa": {
        "priorities": [
            "Full coverage (may need multiple mesh nodes)",
            "Indoor and outdoor security",
            "Perimeter protection",
        ],
        "common_rooms": ["living", "master_bedroom", "kitchen", "garden", "perimeter"],
        "recommended_products": [
            "P_WIFI_MESH_01",
            "P_CAM_INDOOR_01",
            "P_CAM_OUTDOOR_01",
            "P_SMART_LOCK_01",
        ],
    },
    "office": {
        "priorities": [
            "Reliable connectivity for work",
            "Conference room coverage",
            "Business security",
        ],
        "common_rooms": ["office", "meeting_room", "reception", "conference"],
        "recommended_products": ["P_WIFI_MESH_01", "P_CAM_INDOOR_01"],
    },
}

# Use case patterns
USE_CASE_PATTERNS = {
    "security_sensitive": {
        "priority_products": ["P_CAM_INDOOR_01", "P_SMART_LOCK_01", "P_CAM_OUTDOOR_01"],
        "reasoning": "Security-focused customers need cameras and smart locks for peace of mind",
        "room_focus": ["entrance", "living", "perimeter"],
    },
    "streaming_heavy": {
        "priority_products": ["P_WIFI_MESH_01", "P_TV_BOX_01"],
        "reasoning": "Streaming requires stable Wi-Fi and entertainment devices",
        "room_focus": ["living", "family_room"],
    },
    "work_from_home": {
        "priority_products": ["P_WIFI_MESH_01"],
        "reasoning": "Reliable connectivity essential for video calls and work",
        "room_focus": ["office", "bedroom", "workspace"],
    },
}


def retrieve_relevant_knowledge(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    product_map: Dict[str, Any],
    conversation_history: List[Dict[str, str]],
) -> str:
    """
    RAG: Retrieve relevant product knowledge, best practices, and use cases.
    Returns formatted context string to augment LLM prompt.
    """
    retrieved_context = []
    
    # 1. Retrieve layout-specific best practices
    layout_type = layout.get("layout_type", "unknown").lower()
    if layout_type in LAYOUT_BEST_PRACTICES:
        practices = LAYOUT_BEST_PRACTICES[layout_type]
        retrieved_context.append("Layout Best Practices:")
        retrieved_context.append(f"- Priorities: {', '.join(practices['priorities'])}")
        retrieved_context.append(f"- Common rooms: {', '.join(practices['common_rooms'])}")
        retrieved_context.append(
            f"- Typically recommended products: {', '.join(practices['recommended_products'])}"
        )
        retrieved_context.append("")
    
    # 2. Retrieve use case patterns based on profile
    usage = profile.get("usage", {})
    for usage_key, pattern in USE_CASE_PATTERNS.items():
        if usage.get(usage_key):
            retrieved_context.append(f"Use Case Pattern: {usage_key.replace('_', ' ').title()}")
            retrieved_context.append(f"- Reasoning: {pattern['reasoning']}")
            retrieved_context.append(
                f"- Priority products: {', '.join(pattern['priority_products'])}"
            )
            retrieved_context.append(f"- Room focus: {', '.join(pattern['room_focus'])}")
            retrieved_context.append("")
    
    # 3. Retrieve product-specific knowledge based on layout rooms
    rooms = layout.get("rooms", [])
    room_names_lower = {room.get("name", "").lower() for room in rooms}
    total_area = layout.get("total_area", "")
    
    # Check for large homes (may need multiple mesh nodes)
    if total_area:
        try:
            area_num = float(total_area.split()[0]) if total_area.split() else 0
            if area_num > 2000:
                retrieved_context.append("Large Home Considerations:")
                retrieved_context.append(
                    "- Homes >2000 sq ft may benefit from multiple Wi-Fi mesh nodes"
                )
                retrieved_context.append("")
        except (ValueError, IndexError):
            pass
    
    # 4. Retrieve product knowledge for relevant products
    relevant_products = []
    
    # Check room types and suggest relevant products
    if any("bedroom" in name.lower() or "master" in name.lower() for name in room_names_lower):
        relevant_products.append("P_CAM_INDOOR_01")
    
    if any("living" in name.lower() or "family" in name.lower() for name in room_names_lower):
        relevant_products.append("P_CAM_INDOOR_01")
        relevant_products.append("P_TV_BOX_01")
    
    if any("entrance" in name.lower() or "entry" in name.lower() for name in room_names_lower):
        relevant_products.append("P_SMART_LOCK_01")
        relevant_products.append("P_CAM_INDOOR_01")
    
    if layout_type == "villa":
        relevant_products.append("P_CAM_OUTDOOR_01")
    
    # Always include Wi-Fi mesh
    relevant_products.append("P_WIFI_MESH_01")
    
    # Retrieve knowledge for relevant products
    if relevant_products:
        retrieved_context.append("Product Knowledge:")
        for product_id in set(relevant_products):  # Remove duplicates
            if product_id in PRODUCT_KNOWLEDGE_BASE:
                knowledge = PRODUCT_KNOWLEDGE_BASE[product_id]
                product_name = product_map.get(product_id, {}).get("name", product_id)
                retrieved_context.append(f"\n{product_name} ({product_id}):")
                
                if "use_cases" in knowledge:
                    retrieved_context.append("  Use cases:")
                    for use_case in knowledge["use_cases"][:3]:  # Top 3
                        retrieved_context.append(f"    - {use_case}")
                
                if "room_recommendations" in knowledge:
                    retrieved_context.append("  Room recommendations:")
                    for room_type, rec in list(knowledge["room_recommendations"].items())[:2]:
                        retrieved_context.append(f"    - {room_type}: {rec}")
                
                if "best_for" in knowledge:
                    retrieved_context.append("  Best for:")
                    for target in knowledge["best_for"][:2]:  # Top 2
                        retrieved_context.append(f"    - {target}")
        
        retrieved_context.append("")
    
    # 5. Extract conversation context for LLM to analyze
    conversation_context = _extract_conversation_preferences(conversation_history)
    if conversation_context:
        retrieved_context.append("Recent Conversation Context:")
        for key, value in conversation_context.items():
            retrieved_context.append(f"- {value}")
        retrieved_context.append("")
        retrieved_context.append("Note: Analyze the conversation above to understand user's budget preferences, priorities, and needs.")
        retrieved_context.append("The LLM should determine if user wants premium/complete solution or value-focused recommendations.")
        retrieved_context.append("")
    
    return "\n".join(retrieved_context)


def _extract_conversation_preferences(
    conversation_history: List[Dict[str, str]]
) -> Dict[str, str]:
    """
    Extract user preferences from conversation history.
    Returns conversation context for LLM to analyze (not keyword-based detection).
    """
    preferences = {}
    
    # Provide conversation context for LLM to analyze naturally
    # Don't do keyword matching - let LLM understand intent from context
    
    # Check last few user messages and provide context
    recent_user_messages = []
    for msg in conversation_history[-5:]:  # Last 5 messages for better context
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if content:
                recent_user_messages.append(content)
    
    if recent_user_messages:
        # Provide full conversation context for LLM analysis
        preferences["conversation_context"] = "Recent user messages: " + " | ".join(recent_user_messages[:3])
    
    return preferences
