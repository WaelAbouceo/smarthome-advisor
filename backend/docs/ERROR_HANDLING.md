# Error Handling Documentation

Consistent error handling patterns across the API.

## HTTP Status Codes

| Code | Usage | Example |
|------|-------|---------|
| `400` | Bad request (validation, missing params) | Missing `layout_id` |
| `404` | Resource not found | Customer or layout not in cache |
| `503` | Service unavailable | OpenAI API down |

## FastAPI HTTPException

### Standard Pattern

```python
from fastapi import HTTPException

# Validation error
if not layout_id:
    logger.warning("missing layout_id")
    raise HTTPException(status_code=400, detail="layout_id is required")

# Not found
layout = _LAYOUT_STORE.get(layout_id)
if not layout:
    logger.warning("layout not found layout_id=%s", layout_id)
    raise HTTPException(status_code=404, detail="Layout not found")

# Service unavailable
if result is None:
    raise HTTPException(
        status_code=503,
        detail="Advisor temporarily unavailable. Check OPENAI_API_KEY."
    )
```

## Error Response Format

FastAPI automatically formats errors:

```json
{
  "detail": "layout_id is required"
}
```

For validation errors (Pydantic):
```json
{
  "detail": [
    {
      "loc": ["body", "customer_id"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

## Logging Before Raising

**Always log before raising HTTPException:**

```python
# Good
if not layout:
    logger.warning("layout not found layout_id=%s", layout_id)
    raise HTTPException(status_code=404, detail="Layout not found")

# Bad (no logging)
if not layout:
    raise HTTPException(status_code=404, detail="Layout not found")
```

## Exception Handling

### Try/Except with Logging

```python
try:
    analysis = analyze_layout_bytes(filename, content)
except Exception as e:
    logger.error("layout analysis failed filename=%s", filename, exc_info=True)
    # Return fallback or re-raise
    raise HTTPException(status_code=500, detail="Analysis failed")
```

### LLM Call Failures

```python
result = generate_advisor_response(...)
if result is None:
    # LLM unavailable - log and return 503
    logger.warning("LLM unavailable")
    raise HTTPException(
        status_code=503,
        detail="Advisor temporarily unavailable. Check OPENAI_API_KEY."
    )
```

## Validation Errors

### Pydantic Models

Pydantic automatically validates and returns 422 on error:

```python
class AdvisorChatRequest(BaseModel):
    customer_id: str
    messages: List[ChatMessage]
    layout_id: Optional[str] = None

# Invalid request → 422 with validation details
```

### Manual Validation

```python
if not file.filename:
    logger.warning("missing filename")
    raise HTTPException(status_code=400, detail="Missing filename")

if not content:
    logger.warning("empty file filename=%s", file.filename)
    raise HTTPException(status_code=400, detail="Empty file")
```

## Error Messages

### User-Friendly Messages

```python
# Good - Clear, actionable
raise HTTPException(
    status_code=404,
    detail="Layout not found. Upload a floor plan first via /layout/analyze"
)

# Bad - Too technical
raise HTTPException(
    status_code=404,
    detail="KeyError: layout_id 'abc123' not in _LAYOUT_STORE"
)
```

### Include Context

```python
# Good - Includes what was requested
raise HTTPException(
    status_code=404,
    detail=f"Layout '{layout_id}' not found. Available: {list(_LAYOUT_STORE.keys())[:5]}"
)
```

## Common Patterns

### Missing Resource

```python
layout = _LAYOUT_STORE.get(layout_id)
if not layout:
    logger.warning("layout not found layout_id=%s available_ids=%s", 
                   layout_id, list(_LAYOUT_STORE.keys())[:5])
    raise HTTPException(
        status_code=404,
        detail=f"Layout '{layout_id}' not found. Upload a floor plan first."
    )
```

### Service Unavailable

```python
result = call_external_service()
if result is None:
    logger.warning("external service unavailable")
    raise HTTPException(
        status_code=503,
        detail="Service temporarily unavailable. Please try again later."
    )
```

### Invalid Input

```python
if not description or not description.strip():
    raise HTTPException(
        status_code=400,
        detail="description is required and cannot be empty"
    )
```

## Frontend Error Handling

Frontend receives standard HTTP error responses:

```typescript
try {
  const response = await fetch('/api/v1/advisor/chat', {...});
  if (!response.ok) {
    const error = await response.json();
    // error.detail contains the message
    throw new Error(error.detail || 'Request failed');
  }
} catch (e) {
  // Handle error
}
```

## Best Practices

1. **Always log before raising** - Include context (IDs, counts, etc.)
2. **Use appropriate status codes** - 400 for validation, 404 for not found, 503 for service issues
3. **User-friendly messages** - Avoid technical details in error messages
4. **Include context** - Help users understand what went wrong
5. **Consistent format** - Use `detail` field for all errors
6. **Log at appropriate level** - WARNING for expected errors, ERROR for unexpected

## Example: Complete Error Handling

```python
@router.post("/chat")
def advisor_chat(req: AdvisorChatRequest):
    # Validate customer exists
    profile = crm.get_profile(req.customer_id)
    if not profile:
        logger.warning("customer not found customer_id=%s", req.customer_id)
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Load layout if provided
    layout = {}
    if req.layout_id:
        layout = _LAYOUT_STORE.get(req.layout_id, {})
        if not layout:
            logger.warning("layout not found layout_id=%s", req.layout_id)
            raise HTTPException(
                status_code=404,
                detail="Layout not found. Upload a floor plan first."
            )
    
    # Call LLM
    result = generate_advisor_response(...)
    if result is None:
        logger.warning("LLM unavailable")
        raise HTTPException(
            status_code=503,
            detail="Advisor temporarily unavailable. Check configuration."
        )
    
    # Success
    return response.model_dump()
```
