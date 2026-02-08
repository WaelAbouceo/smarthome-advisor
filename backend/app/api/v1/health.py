from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "openai_configured": bool(settings.openai_api_key),
    }
