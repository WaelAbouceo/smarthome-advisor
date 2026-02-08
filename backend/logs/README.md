# LLM Call Logs

## `llm_calls.jsonl`

JSONL file (one JSON object per line) containing all LLM API calls.

### Format

Each line is a JSON object:
```json
{
  "agent": "advisor" | "layout_vision" | "layout_description",
  "ts": 1707312615.123,
  "request_id": "a1b2c3d4",
  "input": {
    "messages_count": 5,
    "last_user_preview": "add a garage"
  },
  "output": "{\"reply\": \"...\", \"action\": \"ask\"}"
}
```

### Fields

- **agent**: Which LLM service made the call
- **ts**: Unix timestamp
- **request_id**: Request correlation ID (from header or auto-generated)
- **input**: Summary of input (no full prompts/base64 for privacy)
- **output**: Raw LLM response

### Usage

```bash
# View all advisor calls
grep '"agent":"advisor"' llm_calls.jsonl

# Find calls for a specific request
grep '"request_id":"a1b2c3d4"' llm_calls.jsonl

# Count calls by agent
grep -o '"agent":"[^"]*"' llm_calls.jsonl | sort | uniq -c
```

### Privacy

- No full prompts (too large)
- No base64 images (privacy)
- Only summary fields (counts, previews)

See [docs/LOGGING.md](../docs/LOGGING.md) for full logging documentation.
