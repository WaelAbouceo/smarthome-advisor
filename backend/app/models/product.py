from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class Product(BaseModel):
    product_id: str
    name: str
    category: str
    tags: List[str]
    price_monthly: Optional[float] = None
    price_one_time: Optional[float] = None
    compatibility: List[str]
    notes: Optional[str] = None

class Bundle(BaseModel):
    bundle_id: str
    name: str
    items: List[str]
    bundle_monthly: float
    bundle_notes: Optional[str] = None

class Catalog(BaseModel):
    version: str
    currency: str
    products: List[Product]
    bundles: List[Bundle]
