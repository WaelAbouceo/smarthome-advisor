from __future__ import annotations
from typing import Dict, Any, List
from app.services.recommendation.recommender import recommend


def build_ui_plan(
    profile: Dict[str, Any],
    layout: Dict[str, Any],
    catalog: Dict[str, Any],
    product_map: Dict[str, Any],
):
    """
    Converts recommendation output into
    frontend-ready room-by-room UI payload.
    """

    bundles = catalog.get("bundles", [])
    recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)

    # Group products per room
    rooms: Dict[str, List[Dict[str, Any]]] = {}

    for r in recos:
        p = product_map.get(r.product_id, {})
        rooms.setdefault(r.room, []).append(
            {
                "product_id": r.product_id,
                "name": p.get("name"),
                "category": p.get("category"),
                "price_monthly": p.get("price_monthly"),
                "price_one_time": p.get("price_one_time"),
                "reason": r.why,
                "image": f"/images/{r.product_id}.png",  # placeholder path for UI
            }
        )

    # Resolve bundle info
    bundle_info = None
    if bundle_id:
        for b in bundles:
            if b.get("bundle_id") == bundle_id:
                bundle_info = {
                    "bundle_id": bundle_id,
                    "name": b.get("name"),
                    "monthly": b.get("bundle_monthly"),
                    "notes": b.get("bundle_notes"),
                }
                break

    return {
        "persona_segment": profile.get("segment"),
        "layout_type": layout.get("layout_type"),
        "rooms": [
            {"room": room, "products": products}
            for room, products in rooms.items()
        ],
        "bundle": bundle_info,
        "totals": {
            "monthly": est_monthly,
            "currency": catalog.get("currency"),
        },
    }
