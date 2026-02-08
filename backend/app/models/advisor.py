from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional, Literal

class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class AdvisorChatRequest(BaseModel):
    customer_id: str
    messages: List[ChatMessage]
    layout_id: Optional[str] = None
    stream: bool = True

class RecommendationItem(BaseModel):
    room: str
    product_id: str
    why: str

# LLM decides next step from context: ask (clarify) or offer_plan (show recommendations)
AdvisorAction = Literal["ask", "offer_plan"]


class AdvisorChatResponse(BaseModel):
    answer: str
    persona: Dict[str, Any] = Field(default_factory=dict)
    layout: Dict[str, Any] = Field(default_factory=dict)
    recommended_products: List[RecommendationItem] = Field(default_factory=list)
    recommended_bundle_id: Optional[str] = None
    estimated_monthly: Optional[float] = None
    # LLM decides from context: "ask" = question to user, "offer_plan" = show personalized plan
    action: AdvisorAction = "offer_plan"
