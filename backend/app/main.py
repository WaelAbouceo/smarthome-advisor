import os
import sys
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Ensure backend dir is on path for app imports
_backend_dir = Path(__file__).resolve().parents[1]
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import bind_request_id, get_logger, setup_logging
from app.core.prompts import clear_prompt_cache

logger = get_logger("main")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Assign request_id and log each request with method, path, status, duration."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        bind_request_id(request_id)
        start = time.perf_counter()
        logger.debug("request_start %s %s", request.method, request.url.path)
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.debug(
            "%s %s %d %.2fms (request_id=%s)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        response.headers["X-Request-ID"] = request_id
        return response


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(RequestLoggingMiddleware)

    # CORS for frontend (e.g. WaelAbouceo/e-smart-living-advisor)
    origins = settings.cors_origins
    if os.getenv("CORS_ORIGINS"):
        origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    @app.get("/")
    def root():
        return {"app": settings.app_name, "docs": "/docs", "health": "/api/v1/health"}

    @app.on_event("startup")
    def _log_startup():
        clear_prompt_cache()
        logger.info(
            "app_started app=%s openai_configured=%s",
            settings.app_name,
            bool(settings.openai_api_key),
        )

    return app

app = create_app()
