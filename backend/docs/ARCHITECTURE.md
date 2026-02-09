# System Architecture

High-level system design and data flow for Smart Living AI buddy - Demo v0.

## Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   FastAPI     │─────▶│   OpenAI     │
│   React     │      │   Backend     │      │   GPT-4o     │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ In-Memory    │
                     │ Layout Store │
                     └──────────────┘
```

## Components

### Frontend (React)
- **ChatPanel**: Conversational interface
- **LayoutSummary**: Layout display and editing
- **LayoutUpload**: File upload component
- **API Client**: Centralized API calls with TypeScript types

### Backend (FastAPI)
- **API Layer**: REST endpoints (`app/api/v1/`)
- **Services**: Business logic (`app/services/`)
- **Models**: Data validation (`app/models/`)
- **Core**: Logging, config, prompts (`app/core/`)

### External Services
- **OpenAI GPT-4o**: Vision analysis for floor plans
- **OpenAI GPT-4o-mini**: Conversational advisor

## Data Flow

### 1. Layout Upload Flow

```
User uploads file
    ↓
Frontend: POST /api/v1/layout/analyze
    ↓
Backend: analyze_layout_bytes()
    ↓
GPT-4o Vision: Analyze image
    ↓
Returns LayoutAnalysis (rooms, dimensions, confidence)
    ↓
Frontend: POST /api/v1/advisor/layout_cache/upsert
    ↓
Backend: Store in _LAYOUT_STORE
    ↓
Frontend: Display in LayoutSummary, initialize chat
```

### 2. Chat Flow

```
User sends message
    ↓
Frontend: POST /api/v1/advisor/chat/stream
    ↓
Backend: Load layout from _LAYOUT_STORE
    ↓
Backend: Build persona from CRM profile
    ↓
Backend: Get product recommendations
    ↓
Backend: Call GPT-4o-mini with context
    ↓
LLM: Returns reply + optional layout_updates
    ↓
Backend: Merge layout_updates if present
    ↓
Backend: Stream response via SSE
    ↓
Frontend: Display reply, update layout panel
```

### 3. Layout Update Flow (LLM-Driven)

```
User: "add a garage"
    ↓
LLM detects layout change
    ↓
LLM returns: {"reply": "...", "layout_updates": {"rooms": [...]}}
    ↓
Backend: Merge layout_updates into cached layout
    ↓
Backend: Return updated layout in response
    ↓
Frontend: Update LayoutSummary panel
```

## Storage

### In-Memory Store (Demo v0)

```python
_LAYOUT_STORE: dict[str, dict] = {}
# Key: layout_id
# Value: LayoutAnalysis dict
```

**Limitations:**
- Lost on restart
- Single process only
- No persistence

**For Production:**
- Use PostgreSQL or similar
- Add Redis for caching
- Implement proper data models

## State Management

### Frontend
- React `useState` for component state
- `useRef` for tracking local updates
- API calls trigger state updates

### Backend
- In-memory `_LAYOUT_STORE` dictionary
- Request-scoped (no shared state between requests)
- Stateless API design

## API Design

### RESTful Endpoints
- `POST /api/v1/layout/analyze` - Create resource
- `POST /api/v1/layout/{id}/save` - Update resource
- `POST /api/v1/advisor/chat` - Action endpoint

### Streaming
- SSE (Server-Sent Events) for chat streaming
- Chunked responses for better UX

### Error Handling
- Standard HTTP status codes
- Consistent error format: `{"detail": "message"}`
- Logging before raising exceptions

## Security (Demo v0)

**Current:**
- No authentication
- No authorization
- CORS enabled for localhost

**For Production:**
- Add JWT authentication
- Implement RBAC
- Rate limiting
- Input validation/sanitization
- HTTPS only

## Performance

### Current Optimizations
- Streaming responses (SSE)
- In-memory caching
- LLM call logging for debugging

### Production Considerations
- Database connection pooling
- Redis caching layer
- CDN for static assets
- Request rate limiting
- LLM response caching

## Monitoring

### Logging
- Structured logging with request IDs
- LLM call logging to JSONL file
- Error logging with context

### Metrics (Future)
- Request latency
- LLM call latency
- Error rates
- Cache hit rates

## Deployment

### Current (Demo)
- Local development only
- Single process
- No load balancing

### Production
- Containerized (Docker)
- Process manager (systemd/supervisor)
- Reverse proxy (nginx)
- Load balancer (if multiple instances)

## Scalability

### Current Limitations
- Single process
- In-memory storage
- No horizontal scaling

### Production Architecture
```
Load Balancer
    ↓
Multiple FastAPI Instances
    ↓
PostgreSQL (persistence)
Redis (caching, sessions)
    ↓
OpenAI API
```

## Key Design Decisions

1. **LLM-Driven Layout Updates**: LLM handles natural language instead of complex parsers
2. **Bidirectional Sync**: Chat and panel stay synchronized
3. **Streaming Responses**: Better UX for long LLM responses
4. **In-Memory Storage**: Simple for demo, easy to replace with DB
5. **Type Safety**: Pydantic models for validation, TypeScript for frontend

## Future Enhancements

- Database persistence
- Multi-user support
- Authentication/authorization
- PDF multi-page support
- Canvas-based layout editor
- Product placement visualization
- Correction logging for training data
