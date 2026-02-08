"""
Streaming helper: yields text in chunks for SSE. Advisor responses are LLM-only (see llm_openai).
Chunks on word boundaries so markdown (e.g. **bold**) is not split mid-token.
"""
from __future__ import annotations
import re
import time


def stream_text(text: str, chunk_size: int = 36, delay_s: float = 0.01):
    """
    Yields chunks for streaming. Prefers word boundaries so partial content
    stays readable and markdown like **bold** is not broken in the middle.
    """
    if not text:
        return
    parts = re.split(r"(\s+)", text)
    chunk = ""
    for part in parts:
        if len(chunk) + len(part) <= chunk_size:
            chunk += part
        else:
            if chunk:
                yield chunk
                time.sleep(delay_s)
            # Single token longer than chunk_size (e.g. long word or URL)
            if len(part) > chunk_size:
                for i in range(0, len(part), chunk_size):
                    yield part[i : i + chunk_size]
                    time.sleep(delay_s)
                chunk = ""
            else:
                chunk = part
    if chunk:
        yield chunk
