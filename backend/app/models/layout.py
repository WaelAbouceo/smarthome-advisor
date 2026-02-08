from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union

class LayoutAnalysis(BaseModel):
    layout_id: str
    layout_type: str  # apartment/villa/office/unknown
    rooms: List[Dict[str, Any]]  # each may have room_id, room/name, room_type, bbox, polygon, width, length, area, confidence, source, status
    entry_points: List[Union[str, Dict[str, Any]]]  # string labels or {id, label, pos, confidence}
    notes: List[str]
    confidence: float
    source_filename: Optional[str] = None
    measurement_units: Optional[str] = None
    total_area: Optional[str] = None
    mentioned_spaces_area: Optional[str] = None
    unassigned_space: Optional[str] = None
    layout_confidence: Optional[float] = None  # alias for confidence in editor spec
