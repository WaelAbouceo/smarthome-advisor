from __future__ import annotations
from pydantic import BaseModel
from typing import Any, Dict, Optional, List

class CRMProfile(BaseModel):
    customer_id: str
    name: str
    segment: str
    city: Optional[str] = None
    services: Dict[str, Any]
    household: Dict[str, Any]
    usage: Dict[str, Any]
    revenue: Optional[Dict[str, Any]] = None  # e.g., {"monthly_aed": 500, "annual_aed": 6000}
    devices: Optional[List[Dict[str, Any]]] = None  # e.g., [{"type": "smart_speaker", "brand": "Amazon", "model": "Echo Dot"}]
    account_age_years: Optional[float] = None  # Years as customer
    contract_type: Optional[str] = None  # "monthly", "annual", "prepaid"
    payment_method: Optional[str] = None  # "credit_card", "debit_card", "bank_transfer", "auto_pay"
    previous_purchases: Optional[List[str]] = None  # List of product IDs previously purchased

class Persona(BaseModel):
    customer_id: str
    persona_label: str
    key_traits: list[str]
    budget_hint: str
    priorities: list[str]
