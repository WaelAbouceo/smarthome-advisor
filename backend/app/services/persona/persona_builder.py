from __future__ import annotations
from typing import Dict, Any
from app.models.profile import Persona

def build_persona(profile: Dict[str, Any]) -> Persona:
    usage = profile.get("usage", {})
    segment = profile.get("segment", "Unknown")

    traits = []
    priorities = []

    if usage.get("security_sensitive"):
        traits.append("security-first")
        priorities.append("Home security & access control")

    if usage.get("streaming_heavy"):
        traits.append("streaming-heavy")
        priorities.append("Stable Wi-Fi & 4K streaming")

    if usage.get("work_from_home"):
        traits.append("WFH")
        priorities.append("Reliable coverage for meetings")

    budget_hint = "Premium" if segment.lower() == "premium".lower() else "Value"

    label = f"{segment} Smart Living Persona"
    if "security-first" in traits and "streaming-heavy" in traits:
        label = f"{segment} Secure & Entertainment Family"

    return Persona(
        customer_id=profile["customer_id"],
        persona_label=label,
        key_traits=traits or ["general"],
        budget_hint=budget_hint,
        priorities=priorities or ["Comfort & connectivity"],
    )
