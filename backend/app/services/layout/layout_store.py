"""
In-memory store for layout drafts (Phase 0). Keyed by layout_id.
Save and confirm endpoints read/write here; no persistence across restarts.
"""
from __future__ import annotations
from typing import Optional

from app.models.layout import LayoutAnalysis

_layout_store: dict[str, LayoutAnalysis] = {}


def get_layout(layout_id: str) -> Optional[LayoutAnalysis]:
    return _layout_store.get(layout_id)


def save_layout(layout: LayoutAnalysis) -> None:
    _layout_store[layout.layout_id] = layout


def confirm_layout(layout_id: str) -> Optional[LayoutAnalysis]:
    layout = _layout_store.get(layout_id)
    if layout is None:
        return None
    # Optionally set all room statuses to "confirmed" for downstream
    rooms = []
    for r in layout.rooms:
        if isinstance(r, dict):
            r = dict(r)
            r["status"] = "confirmed"
        rooms.append(r)
    confirmed = layout.model_copy(update={"rooms": rooms})
    _layout_store[layout_id] = confirmed
    return confirmed
