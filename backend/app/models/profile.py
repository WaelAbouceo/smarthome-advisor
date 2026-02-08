from __future__ import annotations
from pydantic import BaseModel
from typing import Any, Dict, Optional

class CRMProfile(BaseModel):
    customer_id: str
    name: str
    segment: str
    city: Optional[str] = None
    services: Dict[str, Any]
    household: Dict[str, Any]
    usage: Dict[str, Any]

class Persona(BaseModel):
    customer_id: str
    persona_label: str
    key_traits: list[str]
    budget_hint: str
    priorities: list[str]
