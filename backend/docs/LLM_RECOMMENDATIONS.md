# LLM-Powered Recommendations with Fallback

## Overview

The recommendation system now supports LLM-powered product recommendations with automatic fallback to rule-based recommendations if the LLM fails.

## Architecture

```
User Request
    ↓
Try LLM Recommendations
    ↓ (if fails or invalid)
Fallback to Rule-Based
    ↓
Pass to Advisor LLM (for conversational formatting)
```

## Files Added

### 1. `backend/prompts/recommender_system.md`
- Prompt file for LLM recommender
- Defines rules for product matching, room assignment, bundle selection
- Includes examples and validation rules

### 2. `backend/app/services/recommendation/llm_recommender.py`
- `recommend_with_llm_fallback()`: Main function that tries LLM first, falls back to rule-based
- `_try_llm_recommendations()`: Calls LLM to generate recommendations
- `_build_recommender_context()`: Builds context string for LLM
- `_validate_recommendations()`: Validates LLM output
- `_fallback_to_rule_based()`: Calls original rule-based recommender

### 3. Updated `backend/app/api/v1/advisor.py`
- Both `/chat` and `/chat/stream` endpoints now use LLM recommender
- Feature flag: `ENABLE_LLM_RECOMMENDATIONS` (env var, default: true)
- Automatic fallback on any error

## How It Works

### 1. LLM Recommendation Generation

The LLM receives:
- Customer profile (usage patterns, segment)
- Layout information (rooms, sizes, layout type)
- Product catalog (all products with details)
- Bundles (pre-configured bundles)
- Conversation history (last 3 messages)

The LLM returns JSON:
```json
{
  "recommendations": [
    {
      "room": "actual room name",
      "product_id": "P_XXX",
      "why": "reasoning"
    }
  ],
  "bundle_id": "B_XXX" or null,
  "estimated_monthly": number
}
```

### 2. Validation

- Product IDs must exist in catalog
- Room names should match layout (allows "Whole Home", "Entrance", "Perimeter")
- At least one recommendation required
- Monthly price recalculated if invalid

### 3. Fallback Triggers

Falls back to rule-based when:
- LLM API call fails
- LLM returns invalid JSON
- LLM returns no recommendations
- Validation fails
- Any exception occurs

## Configuration

### Environment Variable

```bash
# Enable LLM recommendations (default: true)
ENABLE_LLM_RECOMMENDATIONS=true

# Disable LLM recommendations (use rule-based only)
ENABLE_LLM_RECOMMENDATIONS=false
```

### Code-Level Control

```python
# In advisor.py
ENABLE_LLM_RECOMMENDATIONS = os.getenv("ENABLE_LLM_RECOMMENDATIONS", "true").lower() == "true"
```

## Benefits

### LLM Recommendations:
- ✅ Uses actual detected room names
- ✅ Considers room sizes and types
- ✅ Adapts to conversation history
- ✅ More personalized reasoning
- ✅ Handles edge cases better

### Fallback Ensures:
- ✅ Always returns recommendations
- ✅ System continues working if LLM fails
- ✅ Fast fallback if LLM is slow
- ✅ Cost control (can disable LLM)

## Monitoring

Logs indicate which method was used:

```
INFO: Using LLM-generated recommendations: count=4 bundle=B_SECURE_HOME monthly=89
INFO: Falling back to rule-based recommendations
WARNING: LLM recommendation failed validation, falling back to rule-based
```

## Testing

### Test LLM Recommendations:
1. Ensure `ENABLE_LLM_RECOMMENDATIONS=true` (default)
2. Make a chat request with layout
3. Check logs for "Using LLM-generated recommendations"

### Test Fallback:
1. Set `ENABLE_LLM_RECOMMENDATIONS=false`
2. Or temporarily break LLM (invalid API key)
3. Check logs for "Falling back to rule-based recommendations"

### Compare Results:
- LLM: Uses actual room names, more personalized
- Rule-based: Fixed room names ("Living", "Entrance"), simpler logic

## Future Enhancements

- [ ] A/B testing framework
- [ ] Recommendation analytics
- [ ] Cache LLM recommendations
- [ ] Fine-tune prompt based on performance
- [ ] Multi-model support (try different LLMs)

## Notes

- LLM recommendations are more expensive (extra API call)
- LLM recommendations may be slower (network latency)
- Fallback ensures reliability
- Feature flag allows easy toggling
