"""
Ollama/Llama Scout LLM integration for smarthome advisor.

This module provides integration with Ollama-hosted models (especially Llama 4 Scout)
through a Cloudflare tunnel for remote access.

Environment Variables:
- LLM_PROVIDER: Set to "ollama" to use this provider
- OLLAMA_BASE_URL: Base URL of Ollama server
- OLLAMA_TOKEN: Authentication token for the tunnel (if required)
"""

import json
import os
import re
from typing import Any, Dict, List, Tuple

import requests

from app.core.logging import get_logger
from app.core.prompts import get_prompt

logger = get_logger("llm.ollama")

# Type alias for (reply, action, layout_updates)
AdvisorResult = Tuple[str, str, Dict[str, Any] | None]


class OllamaClient:
    """Client for communicating with Ollama-hosted models via Cloudflare tunnel."""

    def __init__(
        self,
        base_url: str | None = None,
        token: str | None = None,
        model: str = "llama4:scout",
        timeout: int = 300,
    ):
        self.base_url = base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.token = token or os.environ.get("OLLAMA_TOKEN")
        self.model = model
        self.timeout = timeout

        # Remove trailing slash from base_url
        if self.base_url.endswith("/"):
            self.base_url = self.base_url[:-1]

        self._session: requests.Session | None = None
        logger.info(f"Initialized OllamaClient with base_url={self.base_url}, model={self.model}")

    def _get_session(self) -> requests.Session:
        """Get or create a requests session, bootstrapping Cloudflare tunnel auth if needed."""
        if self._session is not None:
            return self._session

        self._session = requests.Session()

        # If we have a token, bootstrap the session cookie via GET /?token=...
        # This is required for Cloudflare tunnel authentication
        if self.token:
            try:
                logger.debug("Bootstrapping Cloudflare tunnel session with token...")
                r = self._session.get(
                    f"{self.base_url}/",
                    params={"token": self.token},
                    timeout=60,
                )
                r.raise_for_status()
                logger.info("Cloudflare tunnel session bootstrapped successfully")
            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to bootstrap tunnel session: {e}")
                self._session = None
                raise

        return self._session

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int | None = None,
        json_mode: bool = False,
    ) -> str:
        """Send multi-turn chat messages to the Ollama model."""

        url = f"{self.base_url}/api/chat"

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": False,
        }

        if json_mode:
            payload["format"] = "json"

        if max_tokens:
            payload["num_predict"] = max_tokens

        try:
            session = self._get_session()
            logger.debug(f"Calling Ollama: {url} with model {self.model}")
            response = session.post(
                url,
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()

            data = response.json()
            result = data.get("message", {}).get("content", "")

            logger.debug(f"Ollama response length: {len(result)}")
            return result

        except requests.exceptions.ConnectionError as e:
            logger.error(f"Failed to connect to Ollama at {self.base_url}: {e}")
            self._session = None  # Reset session so next call re-bootstraps
            raise
        except requests.exceptions.Timeout:
            logger.error(f"Ollama request timed out after {self.timeout}s")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama request failed: {e}")
            self._session = None  # Reset session on auth errors
            raise


_client_instance = None


def _get_ollama_client() -> OllamaClient:
    """Get or create the Ollama client singleton."""
    global _client_instance
    if _client_instance is None:
        _client_instance = OllamaClient()
    return _client_instance


def generate_advisor_response(
    persona: Dict[str, Any],
    layout: Dict[str, Any],
    messages: List[Dict[str, str]],
    recos: List[Dict[str, Any]],
    bundle_id: str | None,
    estimated_monthly: float | None,
    product_names: Dict[str, str],
) -> AdvisorResult | None:
    """
    Single agentic call: LLM has full context and decides next step.

    Returns (reply_text, "ask" | "offer_plan", layout_updates) or None if unavailable.
    layout_updates is a dict with updated rooms/layout if LLM detected changes, else None.
    """
    client = _get_ollama_client()

    # Normalize to list of dicts (caller may pass Pydantic models)
    recos = [x.model_dump() if hasattr(x, "model_dump") else x for x in (recos or [])]
    _messages: List[Dict[str, str]] = []
    for m in (messages or []):
        if isinstance(m, dict):
            _messages.append(m)
        else:
            _messages.append({"role": getattr(m, "role", None), "content": (getattr(m, "content", None) or "")})
    messages = _messages

    # Build context for the LLM (mirrors OpenAI implementation)
    name = persona.get("name") or "there"
    layout_type = layout.get("layout_type", "home")
    rooms = layout.get("rooms", [])
    layout_confidence = layout.get("layout_confidence") or layout.get("confidence")
    try:
        conf = float(layout_confidence) if layout_confidence is not None else 1.0
    except (TypeError, ValueError):
        conf = 1.0

    room_list = []
    for room in (rooms or []):
        if not isinstance(room, dict):
            continue
        room_name = room.get("room", room.get("name", ""))
        w, l, h = room.get("width"), room.get("length"), room.get("height")
        area = room.get("area")
        dims = " × ".join(str(x) for x in (w, l, h) if x is not None and x != "")
        part = room_name
        if dims:
            part += f" W×L×H: {dims}"
        if area:
            part += f" area: {area}"
        elif room.get("estimated_size"):
            part += f" ({room.get('estimated_size')})"
        room_list.append(part)
    entry_points = layout.get("entry_points", [])

    by_room: Dict[str, List[Dict[str, Any]]] = {}
    for rec in recos:
        pid = rec.get("product_id", "")
        by_room.setdefault(rec.get("room", ""), []).append({
            "product": product_names.get(pid, pid),
            "why": rec.get("why", ""),
        })

    has_source_file = bool(layout.get("source_filename"))
    has_layout = len(rooms) > 0

    context_parts = [f"Customer: {name}"]
    if has_source_file:
        context_parts.append(f"Floor plan uploaded: {layout.get('source_filename', 'floor plan')}")
    if has_layout:
        context_parts.append(f"Layout type: {layout_type}")
        context_parts.append(f"Confidence: {conf:.2f}")
        context_parts.append(f"Rooms: {', '.join(room_list) if room_list else 'none'}")
        if entry_points:
            context_parts.append(f"Entry points: {entry_points}")
    elif has_source_file:
        context_parts.append("No rooms detected from analysis")

    context = ". ".join(context_parts) + ". "
    units = layout.get("measurement_units")
    total_area = layout.get("total_area")
    mentioned_area = layout.get("mentioned_spaces_area")
    unassigned = layout.get("unassigned_space")
    if any((units, total_area, mentioned_area, unassigned)):
        area_parts = []
        if units:
            area_parts.append(f"units: {units}")
        if total_area:
            area_parts.append(f"total: {total_area}")
        if mentioned_area:
            area_parts.append(f"named rooms: {mentioned_area}")
        if unassigned:
            area_parts.append(f"walls/corridors: {unassigned}")
        context += " Areas: " + ", ".join(area_parts) + ". "
    context += f"When you present the plan, use these recommendations by room (product name + benefit): {json.dumps(by_room)}. "
    if bundle_id:
        context += f"Bundle: {bundle_id}. "
    if estimated_monthly is not None:
        context += f"Estimated monthly: AED {estimated_monthly:.0f}."

    system_base = get_prompt("advisor_system")
    if not system_base:
        logger.warning("advisor_system prompt file missing or empty; using minimal fallback")
        system_base = (
            "You are an e& Smart Living advisor. Reply in JSON only: {\"reply\": \"...\", \"action\": \"ask\" or \"offer_plan\"}. "
            "Be conversational; use the context below for layout and recommendations."
        )
    system_prompt = (
        system_base
        + "\n\n---\nContext (use this information along with conversation history to understand user intent and respond naturally):\n"
        + context
        + "\n\n---\nIMPORTANT: You MUST respond with ONLY a valid JSON object, no other text. Format:\n"
        "{\"reply\": \"your message here\", \"action\": \"ask\", \"layout_updates\": {...}}\n"
        "Do NOT include any text before or after the JSON. Do NOT wrap in markdown code blocks."
    )

    # Build multi-turn messages (system + full conversation history)
    ollama_messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt},
    ]
    for m in messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            ollama_messages.append({"role": role, "content": content})

    try:
        logger.debug("calling Ollama advisor (agentic)")
        raw = client.chat(
            messages=ollama_messages,
            temperature=0.7,
            max_tokens=2000,
            json_mode=True,
        )

        if not raw:
            logger.warning("Ollama advisor returned empty content")
            return None

        logger.debug(f"Ollama response: {raw[:200]}")

        # Strip markdown code block if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```\s*$", "", cleaned)
            cleaned = cleaned.strip()

        # Parse JSON response
        data = None
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            # Try to extract JSON object from response text
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    data = json.loads(cleaned[start:end + 1])
                except json.JSONDecodeError:
                    pass

        if not data or not isinstance(data, dict):
            logger.warning(
                "Ollama advisor response was not valid JSON (first 200 chars): %s",
                raw[:200],
            )
            # Fallback: treat raw text as the reply (model didn't follow JSON format)
            return (raw, "ask", None)

        reply = (data.get("reply") or "").strip()
        action = (data.get("action") or "offer_plan").lower()
        if action not in ("ask", "offer_plan"):
            action = "offer_plan"
        if not reply:
            logger.warning("Ollama advisor JSON had empty reply")
            return None

        # Extract layout_updates if present
        layout_updates = data.get("layout_updates")
        if layout_updates and isinstance(layout_updates, dict):
            logger.debug("LLM returned layout_updates: %d rooms", len(layout_updates.get("rooms", [])))
        else:
            layout_updates = None

        return (reply, action, layout_updates)

    except Exception as e:
        logger.error(f"Ollama generation failed: {e}")
        return None
