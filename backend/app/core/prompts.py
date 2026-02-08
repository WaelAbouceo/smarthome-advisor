"""
Load prompt text from files under prompts_dir (no hardcoded prompts in code).
"""
from __future__ import annotations
from pathlib import Path

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("prompts")

_CACHE: dict[str, str] = {}


def clear_prompt_cache() -> None:
    """Clear in-memory prompt cache so next get_prompt() reads from disk."""
    _CACHE.clear()


def get_prompt(name: str, use_cache: bool = True) -> str:
    """
    Load prompt content from prompts_dir. Tries {name}.md then {name}.txt.
    Returns empty string if file not found. Cached by default.
    """
    if use_cache and name in _CACHE:
        return _CACHE[name]
    base = settings.prompts_dir
    for ext in (".md", ".txt"):
        path = base / f"{name}{ext}"
        if path.is_file():
            try:
                text = path.read_text(encoding="utf-8").strip()
                if use_cache:
                    _CACHE[name] = text
                return text
            except Exception as e:
                logger.warning("prompt load failed path=%s: %s", path, e)
                return ""
    logger.debug("prompt file not found name=%s dir=%s", name, base)
    return ""
