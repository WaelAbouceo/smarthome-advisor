"""
Structured logging and debugging. Configure via env:
- LOG_LEVEL: DEBUG | INFO | WARNING | ERROR (default: INFO)
- LOG_JSON: 1 to emit JSON lines for production (default: human-readable)
- DEBUG: 1 to force LOG_LEVEL=DEBUG and extra debug logs
"""
from __future__ import annotations
import logging
import os
import sys
from contextvars import ContextVar
from typing import Any

# Request ID for correlation (set by middleware)
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


def _log_level() -> int:
    level = (os.environ.get("LOG_LEVEL") or "").upper()
    if os.environ.get("DEBUG", "").strip() in ("1", "true", "yes"):
        return logging.DEBUG
    return getattr(logging, level, logging.INFO)


def _json_formatter(record: logging.LogRecord) -> str:
    import json
    payload: dict[str, Any] = {
        "ts": record.created,
        "level": record.levelname,
        "logger": record.name,
        "msg": record.getMessage(),
    }
    rid = request_id_ctx.get()
    if rid:
        payload["request_id"] = rid
    if record.exc_info:
        payload["exc"] = logging.Formatter().formatException(record.exc_info)
    # Include any extra fields passed to log(..., extra={...})
    skip = {"name", "msg", "args", "created", "filename", "funcName", "levelname", "levelno", "lineno", "module", "msecs", "pathname", "process", "processName", "relativeCreated", "stack_info", "exc_info", "exc_text", "thread", "threadName", "message", "taskName"}
    for k, v in record.__dict__.items():
        if k not in skip and v is not None:
            payload[k] = v
    return json.dumps(payload)


def setup_logging() -> None:
    level = _log_level()
    use_json = os.environ.get("LOG_JSON", "").strip() in ("1", "true", "yes")

    root = logging.getLogger()
    root.setLevel(level)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if use_json:
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                return _json_formatter(record)
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )

    root.addHandler(handler)

    # When DEBUG: only our app gets DEBUG; third-party libs stay quiet
    if level == logging.DEBUG:
        logging.getLogger("app").setLevel(logging.DEBUG)
        # Reduce noise and avoid dumping base64 (e.g. image in vision API request)
        for _name in ("python_multipart", "multipart", "httpx", "httpcore", "openai"):
            logging.getLogger(_name).setLevel(logging.WARNING)
    # Our middleware already logs method, path, status, duration, request_id
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a logger for module `name`. Prefer names under 'app.' for filtering."""
    if not name.startswith("app."):
        name = f"app.{name}"
    return logging.getLogger(name)


def bind_request_id(request_id: str | None) -> None:
    """Set the current request ID (e.g. from middleware)."""
    request_id_ctx.set(request_id)


def get_request_id() -> str | None:
    """Get the current request ID for logging or response headers."""
    return request_id_ctx.get()
