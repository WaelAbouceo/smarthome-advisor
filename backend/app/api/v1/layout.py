from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from app.core.logging import get_logger
from app.models.layout import LayoutAnalysis
from app.services.layout.layout_analyzer import analyze_layout_bytes
from app.services.layout.layout_description import extract_layout_from_description
from app.services.layout.layout_store import save_layout, confirm_layout as store_confirm

router = APIRouter()
logger = get_logger("api.layout")


def _normalize_room_for_editor(room: dict, index: int, source: str = "llm") -> dict:
    """Add room_id, source, status for editor; optional numeric width/length/area."""
    out = dict(room)
    out.setdefault("room_id", f"r{index + 1}")
    out.setdefault("name", out.get("room", "Room"))
    out.setdefault("source", source)
    out.setdefault("status", "suggested")
    # Ensure numeric width/length/area when we have string dims (e.g. "20 ft" -> 20)
    import re
    for key in ("width", "length", "area"):
        val = out.get(key)
        if isinstance(val, (int, float)):
            continue
        if isinstance(val, str):
            n = re.search(r"[\d.]+", val)
            if n:
                try:
                    out[key] = float(n.group())
                except ValueError:
                    pass
    return out


def _analysis_to_draft(analysis: LayoutAnalysis, source: str = "llm") -> LayoutAnalysis:
    """Normalize analyzer output for editor: room_id, source, status on each room."""
    rooms = [
        _normalize_room_for_editor(r if isinstance(r, dict) else {}, i, source)
        for i, r in enumerate(analysis.rooms)
    ]
    return analysis.model_copy(
        update={
            "rooms": rooms,
            "layout_confidence": analysis.layout_confidence if analysis.layout_confidence is not None else analysis.confidence,
        }
    )


class LayoutFromDescriptionRequest(BaseModel):
    description: str


@router.post("/analyze")
async def analyze_layout(file: UploadFile = File(...)):
    if not file.filename:
        logger.warning("layout/analyze missing filename")
        raise HTTPException(status_code=400, detail="Missing filename")
    content = await file.read()
    if not content:
        logger.warning("layout/analyze empty file filename=%s", file.filename)
        raise HTTPException(status_code=400, detail="Empty file")
    logger.info("layout/analyze filename=%s size=%d", file.filename, len(content))
    analysis = analyze_layout_bytes(file.filename, content)
    return analysis.model_dump()


@router.post("/draft")
async def create_draft(file: UploadFile = File(...)):
    """
    Parse file (PDF/image) into a LayoutAnalysis draft for the editor.
    Returns layout with room_id, source, status on each room. Use save/confirm next.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    logger.info("layout/draft filename=%s size=%d", file.filename, len(content))
    analysis = analyze_layout_bytes(file.filename, content)
    draft = _analysis_to_draft(analysis, source="llm")
    return draft.model_dump()


@router.post("/from_description")
def layout_from_description(body: LayoutFromDescriptionRequest):
    """
    Use the LLM to turn a natural-language description of the home/office
    into a structured layout (rooms, sizes, entry points). Client should
    then call POST /advisor/layout_cache/upsert with the returned layout
    and use layout_id in subsequent chat.
    """
    description = (body.description or "").strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")
    analysis = extract_layout_from_description(description)
    if analysis is None:
        raise HTTPException(
            status_code=503,
            detail="Layout from description is unavailable (OpenAI API key required).",
        )
    return analysis.model_dump()


@router.post("/{layout_id}/save")
def save_layout_draft(layout_id: str, body: dict):
    """Save current editor state (full LayoutAnalysis JSON). Idempotent."""
    try:
        layout = LayoutAnalysis(
            layout_id=layout_id,
            layout_type=body.get("layout_type", "unknown"),
            rooms=body.get("rooms", []),
            entry_points=body.get("entry_points", []),
            notes=body.get("notes", []),
            confidence=float(body.get("confidence", 0)),
            source_filename=body.get("source_filename"),
            measurement_units=body.get("measurement_units"),
            total_area=body.get("total_area"),
            mentioned_spaces_area=body.get("mentioned_spaces_area"),
            unassigned_space=body.get("unassigned_space"),
            layout_confidence=body.get("layout_confidence"),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid layout body: {e}")
    if layout.layout_id != layout_id:
        raise HTTPException(status_code=400, detail="layout_id in path and body must match")
    save_layout(layout)
    logger.info("layout/save layout_id=%s rooms=%d", layout_id, len(layout.rooms))
    return {"ok": True, "layout_id": layout_id}


@router.post("/{layout_id}/confirm")
def confirm_layout_draft(layout_id: str):
    """Confirm layout: set room statuses to confirmed and return. Use for proceeding to recommendations."""
    confirmed = store_confirm(layout_id)
    if confirmed is None:
        raise HTTPException(status_code=404, detail="Layout not found; save draft first")
    logger.info("layout/confirm layout_id=%s rooms=%d", layout_id, len(confirmed.rooms))
    return confirmed.model_dump()
