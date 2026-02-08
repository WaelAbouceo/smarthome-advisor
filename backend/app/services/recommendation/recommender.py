from __future__ import annotations
from typing import Dict, Any, List, Tuple, Optional
from app.models.advisor import RecommendationItem

def recommend(profile: Dict[str, Any], layout: Dict[str, Any], product_map: Dict[str, Any], bundles: List[Dict[str, Any]]) -> Tuple[List[RecommendationItem], Optional[str], Optional[float]]:
    """
    Simple deterministic demo recommender:
    - Always suggests Mesh Wi-Fi
    - Adds indoor camera + smart lock if security_sensitive
    - Adds TV box if streaming_heavy
    - Picks the most matching bundle if possible
    """
    usage = profile.get("usage", {})
    security_sensitive = bool(usage.get("security_sensitive"))
    streaming_heavy = bool(usage.get("streaming_heavy"))

    items: List[RecommendationItem] = []
    rooms = layout.get("rooms", [])

    def add(room_name: str, product_id: str, why: str) -> None:
        if product_id not in product_map:
            return
        items.append(RecommendationItem(room=room_name, product_id=product_id, why=why))

    # Wi-Fi mesh
    add("Whole Home", "P_WIFI_MESH_01", "Ensures stable coverage across rooms for streaming and work.")

    # Security pack
    if security_sensitive:
        entry_room = "Entrance"
        add(entry_room, "P_SMART_LOCK_01", "Stronger access control for your main entry.")
        add("Living", "P_CAM_INDOOR_01", "Indoor monitoring with motion alerts for family safety.")
        if layout.get("layout_type") == "villa":
            add("Perimeter", "P_CAM_OUTDOOR_01", "Outdoor camera for gate/perimeter security.")

    # Entertainment
    if streaming_heavy:
        add("Living", "P_TV_BOX_01", "Smooth 4K streaming experience and TV features.")

    # Pick bundle
    chosen_bundle_id: Optional[str] = None
    estimated_monthly: Optional[float] = None
    wanted = {x.product_id for x in items}

    best_score = -1
    for b in bundles:
        bundle_items = set(b.get("items", []))
        score = len(wanted.intersection(bundle_items))
        if score > best_score and score > 0:
            best_score = score
            chosen_bundle_id = b.get("bundle_id")
            estimated_monthly = float(b.get("bundle_monthly"))

    if chosen_bundle_id is None:
        # fallback: sum monthly prices of unique recommended products
        monthly = 0.0
        seen = set()
        for it in items:
            if it.product_id in seen:
                continue
            seen.add(it.product_id)
            p = product_map.get(it.product_id, {})
            monthly += float(p.get("price_monthly") or 0.0)
        estimated_monthly = monthly

    return items, chosen_bundle_id, estimated_monthly
