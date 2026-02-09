from __future__ import annotations
from typing import Dict, Any
from app.models.profile import Persona

def build_persona(profile: Dict[str, Any]) -> Persona:
    usage = profile.get("usage", {})
    segment = profile.get("segment", "Unknown")
    revenue = profile.get("revenue", {})
    devices = profile.get("devices", [])
    account_age = profile.get("account_age_years", 0)

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

    # Consider revenue for budget hint (more accurate than segment alone)
    monthly_revenue = revenue.get("monthly_aed", 0) if revenue else 0
    if monthly_revenue >= 600:
        budget_hint = "Premium"
    elif monthly_revenue >= 300:
        budget_hint = "Mid"
    else:
        budget_hint = "Value"
    
    # Override with segment if revenue data not available
    if monthly_revenue == 0:
        budget_hint = "Premium" if segment.lower() == "premium" else ("Mid" if segment.lower() == "mid" else "Value")

    # Add tech-savvy trait if customer has multiple devices
    if len(devices) >= 3:
        traits.append("tech-savvy")
        priorities.append("Advanced smart home integration")

    # Add early-adopter trait for long-term customers with devices
    if account_age >= 3 and len(devices) > 0:
        traits.append("early-adopter")

    label = f"{segment} Smart Living Persona"
    if "security-first" in traits and "streaming-heavy" in traits:
        label = f"{segment} Secure & Entertainment Family"
    elif "tech-savvy" in traits:
        label = f"{segment} Tech-Forward Smart Home Enthusiast"

    return Persona(
        customer_id=profile["customer_id"],
        persona_label=label,
        key_traits=traits or ["general"],
        budget_hint=budget_hint,
        priorities=priorities or ["Comfort & connectivity"],
    )
