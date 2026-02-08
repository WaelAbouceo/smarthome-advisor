from __future__ import annotations
import hashlib
from app.core.logging import get_logger
from app.models.layout import LayoutAnalysis

logger = get_logger("layout.analyzer")


def _sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()


def analyze_layout_bytes(filename: str, content: bytes) -> LayoutAnalysis:
    """
    Analyze uploaded floor plan using vision LLM (GPT-4o).
    If vision analysis fails or OPENAI_API_KEY is not set, return an "unanalyzed" 
    layout so the advisor can ask the user to describe their home in chat.
    """
    logger.debug("analyze_layout_bytes filename=%s size=%d", filename, len(content))

    try:
        from app.services.layout.layout_vision import analyze_layout_with_vision
        result = analyze_layout_with_vision(filename, content)
        if result is not None:
            logger.info(
                "layout analyzed layout_id=%s type=%s rooms=%d",
                result.layout_id, result.layout_type, len(result.rooms),
            )
            return result
    except Exception as e:
        logger.debug("layout analysis skipped or failed: %s", e, exc_info=True)

    # Fallback when vision is not used or failed: static response (NOT from any LLM).
    # The notes below are returned by this code path only; the vision LLM is never called here.
    lid = f"layout_{_sha1_bytes(content)[:10]}"
    return LayoutAnalysis(
        layout_id=lid,
        layout_type="unknown",
        rooms=[],
        entry_points=[],
        notes=[
            "We couldn't analyze this image automatically (e.g. image analysis is not enabled, or the file isn't a floor plan).",
            "Describe your home in the chat below — e.g. number of rooms, approximate sizes — and I'll use that to suggest a plan. A floor plan drawing or sketch works best when analysis is enabled.",
        ],
        confidence=0.0,
        source_filename=filename,
    )
