# Backend API Documentation

FastAPI backend for Smart Living Advisor - Demo v0

## API Endpoints

### Layout Analysis

**POST `/api/v1/layout/analyze`**
- Upload floor plan (PDF/JPG/PNG)
- Returns `LayoutAnalysis` with rooms, dimensions, confidence
- Uses GPT-4o vision model

**POST `/api/v1/layout/draft`**
- Create layout draft for editor
- Adds `room_id`, `source`, `status` to rooms

**POST `/api/v1/layout/{layout_id}/save`**
- Save layout draft (idempotent)

**POST `/api/v1/layout/{layout_id}/confirm`**
- Confirm layout, set room statuses to "confirmed"

**POST `/api/v1/layout/from_description`**
- Extract layout from natural language description
- Uses LLM to parse description into structured layout

### Advisor Chat

**POST `/api/v1/advisor/chat`**
- Non-streaming chat endpoint
- Returns complete response

**POST `/api/v1/advisor/chat/stream`**
- SSE streaming chat endpoint
- Emits `{"partial_content": "..."}` chunks
- Final: `{"end_of_stream": true, "final": {...}}`

**POST `/api/v1/advisor/layout_cache/upsert`**
- Update layout in cache
- Required before using `layout_id` in chat

### Products & Profile

**GET `/api/v1/products/catalog`**
- Product catalog with bundles

**GET `/api/v1/profile/{customer_id}`**
- Customer profile and persona

**GET `/api/v1/health`**
- Health check endpoint

## Request/Response Models

### AdvisorChatRequest
```python
{
  "customer_id": "CUST_1001",
  "messages": [{"role": "user|assistant", "content": "..."}],
  "layout_id": "layout_abc123"  # optional
}
```

### AdvisorChatResponse
```python
{
  "answer": "Conversational reply...",
  "action": "ask" | "offer_plan",
  "layout": {...},  # Updated layout if LLM made changes
  "recommended_products": [...],
  "recommended_bundle_id": "...",
  "estimated_monthly": 89.0
}
```

### LayoutAnalysis
```python
{
  "layout_id": "layout_abc123",
  "layout_type": "apartment" | "villa" | "office" | "unknown",
  "rooms": [
    {
      "room_id": "r1",
      "name": "Living Room",
      "type": "living",
      "width": 20,
      "length": 21,
      "area": 420,
      "confidence": 0.92
    }
  ],
  "total_area": "2400 sq ft",
  "confidence": 0.85,
  "source_filename": "floor_plan.jpg"
}
```

## Logging

See [docs/LOGGING.md](docs/LOGGING.md) for details.

**Quick Reference:**
- `LOG_LEVEL=DEBUG` - Enable debug logs
- `LOG_JSON=1` - JSON format for production
- Logs include request_id for correlation

## Error Handling

See [docs/ERROR_HANDLING.md](docs/ERROR_HANDLING.md) for patterns.

**Standard HTTP Status Codes:**
- `400` - Bad request (missing/invalid parameters)
- `404` - Not found (customer, layout not in cache)
- `503` - Service unavailable (OpenAI API down)

## Configuration

**Environment Variables:**
- `OPENAI_API_KEY` - Required
- `LOG_LEVEL` - DEBUG | INFO | WARNING | ERROR
- `LOG_JSON` - 1 for JSON logs
- `DEBUG` - 1 to force DEBUG mode

**Config File:** `app/core/config.py`

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design.

**Key Components:**
- `app/api/v1/` - API endpoints
- `app/services/llm/` - LLM integration
- `app/services/layout/` - Layout analysis
- `app/services/recommendation/` - Product recommendations
- `app/core/` - Logging, config, prompts

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run with auto-reload
uvicorn app.main:app --reload --port 8000

# Run with debug logging
DEBUG=1 uvicorn app.main:app --reload
```

## Testing

```bash
# Run tests (if available)
pytest

# Run with coverage
pytest --cov=app
```
