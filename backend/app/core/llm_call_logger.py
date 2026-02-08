"""
Append one JSON line per LLM call to backend/logs/llm_calls.jsonl for debugging.
Each line: {"agent", "ts", "request_id", "input", "output"}.
"""
from __future__ import annotations
import json
import time
from pathlib import Path
from typing import Any

from app.core.logging import get_request_id

# backend/logs (same level as prompts/)
_LOGS_DIR = Path(__file__).resolve().parents[2] / "logs"
_CALLS_FILE = _LOGS_DIR / "llm_calls.jsonl"


def log_llm_call(agent: str, input_summary: dict[str, Any], output: str) -> None:
    """
    Append one JSON line to logs/llm_calls.jsonl with agent, input summary, and raw LLM output.
    Does not log full request content (e.g. base64 images); use input_summary for safe metadata.
    """
    try:
        _LOGS_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "agent": agent,
            "ts": round(time.time(), 3),
            "request_id": get_request_id(),
            "input": input_summary,
            "output": output,
        }
        with open(_CALLS_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass  # do not fail the request if logging fails
