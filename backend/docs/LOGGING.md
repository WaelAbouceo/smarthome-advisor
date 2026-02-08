# Logging Documentation

Structured logging system with request correlation and production-ready JSON output.

## Configuration

### Environment Variables

- **`LOG_LEVEL`**: `DEBUG | INFO | WARNING | ERROR` (default: `INFO`)
- **`LOG_JSON`**: `1` to emit JSON lines (default: human-readable)
- **`DEBUG`**: `1` to force `LOG_LEVEL=DEBUG` and reduce third-party noise

### Examples

```bash
# Development (human-readable, DEBUG)
DEBUG=1 uvicorn app.main:app --reload

# Production (JSON, INFO)
LOG_JSON=1 LOG_LEVEL=INFO uvicorn app.main:app

# Debug specific issue
LOG_LEVEL=DEBUG uvicorn app.main:app
```

## Log Format

### Human-Readable (Development)
```
2026-02-07 14:30:15 | INFO     | app.api.advisor | advisor/chat layout_id=abc123 rooms=5
```

### JSON (Production)
```json
{
  "ts": 1707312615.123,
  "level": "INFO",
  "logger": "app.api.advisor",
  "msg": "advisor/chat layout_id=abc123 rooms=5",
  "request_id": "a1b2c3d4"
}
```

## Request Correlation

Every request gets a `request_id`:
- From `X-Request-ID` header (if provided)
- Or auto-generated UUID (first 8 chars)

Request ID is included in:
- All log messages (via context)
- LLM call logs (`backend/logs/llm_calls.jsonl`)
- Can be added to response headers

## Logger Usage

### Get Logger
```python
from app.core.logging import get_logger

logger = get_logger("api.advisor")  # Creates "app.api.advisor"
```

### Log Levels

```python
logger.debug("Detailed info for debugging")
logger.info("Normal operation")
logger.warning("Something unexpected but handled")
logger.error("Error occurred", exc_info=True)  # Include exception
```

### Structured Logging

```python
# Include extra fields
logger.info(
    "layout analyzed layout_id=%s rooms=%d confidence=%.2f",
    layout_id, len(rooms), conf
)

# With exception
try:
    result = risky_operation()
except Exception as e:
    logger.error("operation failed", exc_info=True)
```

## LLM Call Logging

All LLM calls are logged to `backend/logs/llm_calls.jsonl`:

```json
{
  "agent": "advisor",
  "ts": 1707312615.123,
  "request_id": "a1b2c3d4",
  "input": {
    "messages_count": 5,
    "last_user_preview": "add a garage"
  },
  "output": "{\"reply\": \"...\", \"action\": \"ask\"}"
}
```

**Agents:**
- `advisor` - Conversational advisor
- `layout_vision` - Floor plan analysis
- `layout_description` - Description parsing

**Input Summary:**
- No full prompts (too large)
- No base64 images (privacy)
- Summary fields only (counts, previews)

## Log Locations

- **Application Logs**: stdout (captured by process manager)
- **LLM Calls**: `backend/logs/llm_calls.jsonl` (JSONL format)

## Production Best Practices

1. **Use JSON Format**: Set `LOG_JSON=1` for log aggregation tools
2. **Set Appropriate Level**: `LOG_LEVEL=INFO` for production
3. **Capture stdout**: Use process manager (systemd, Docker, etc.)
4. **Rotate Logs**: Configure log rotation for `llm_calls.jsonl`
5. **Monitor**: Set up alerts on ERROR level logs

## Debugging

### Enable Debug Logs
```bash
DEBUG=1 uvicorn app.main:app --reload
```

### Filter by Request ID
```bash
# Find all logs for a request
grep "request_id=a1b2c3d4" logs/app.log

# Find LLM calls for a request
grep '"request_id":"a1b2c3d4"' logs/llm_calls.jsonl
```

### Reduce Noise
When `DEBUG=1`, third-party libraries are set to WARNING:
- `python_multipart`
- `multipart`
- `httpx`
- `httpcore`
- `openai`
- `uvicorn.access` (we log requests ourselves)

## Example Log Flow

```
[Request Start]
2026-02-07 14:30:15 | DEBUG | app.main | request_start POST /api/v1/advisor/chat

[Business Logic]
2026-02-07 14:30:15 | DEBUG | app.api.advisor | advisor/chat layout found layout_id=abc123 rooms=5
2026-02-07 14:30:15 | INFO  | app.api.advisor | advisor/chat merged LLM layout_updates layout_id=abc123 rooms=6

[LLM Call]
{"agent":"advisor","ts":1707312615.123,"request_id":"a1b2c3d4","input":{...},"output":"..."}

[Request End]
2026-02-07 14:30:16 | DEBUG | app.main | POST /api/v1/advisor/chat 200 1234.56ms (request_id=a1b2c3d4)
```
