# Recommendation Generation Optimization

**Date:** February 8, 2026  
**Status:** ✅ Implemented

## Overview

Optimized the chat logic to **only generate recommendations when needed**, reducing unnecessary LLM calls and improving response times.

## Problem

Previously, recommendations were generated on **every chat message**, even when:
- User was just asking questions
- User was confirming layout details
- User hadn't expressed preferences yet

This resulted in:
- **2 LLM calls per message** (recommendations + advisor response)
- Increased API costs
- Slower response times (~1-2 seconds per recommendation call)

## Solution

Added `_should_generate_recommendations()` function that determines when recommendations are needed:

### When Recommendations ARE Generated:

1. **User explicitly asks** - Keywords: "recommend", "suggest", "what do you recommend", "show me", etc.
2. **Layout confirmed + Preferences expressed** - User has:
   - Uploaded/confirmed layout (has rooms)
   - Expressed preferences (security, entertainment, wifi, budget, convenience)
3. **Updating existing plan** - Previous assistant message mentioned products/prices (indicating plan was already offered)

### When Recommendations ARE NOT Generated:

- User is just chatting (greetings, questions)
- Layout not uploaded yet
- Layout uploaded but no preferences expressed
- User confirming/editing layout details

## Implementation

### Changes Made:

1. **`backend/app/api/v1/advisor.py`**:
   - Added `_should_generate_recommendations()` helper function
   - Modified `/chat` endpoint to check before generating recommendations
   - Modified `/chat/stream` endpoint to check before generating recommendations
   - When skipped: `recos = []`, `bundle_id = None`, `est_monthly = None`

2. **`backend/app/services/llm/llm_openai.py`**:
   - Made recommendation context conditional (only included when recommendations exist)
   - LLM can still respond conversationally without products

### Code Flow:

```python
# Before optimization (every message):
recos, bundle_id, est_monthly = recommend_with_llm_fallback(...)  # Always called

# After optimization (conditional):
should_gen_recos = _should_generate_recommendations(layout, messages)
if should_gen_recos:
    recos, bundle_id, est_monthly = recommend_with_llm_fallback(...)
else:
    recos, bundle_id, est_monthly = [], None, None  # Skip generation
```

## Expected Impact

### Performance Improvements:
- **~50% reduction** in LLM recommendation calls for typical conversations
- **Faster response times** for non-recommendation messages (~1-2 seconds saved)
- **Lower API costs** (fewer LLM calls)

### User Experience:
- **No change** in functionality - recommendations still appear when appropriate
- **Faster responses** for layout confirmation and preference discovery
- **Same quality** recommendations when they are generated

## Testing

### Test Scenarios:

1. **Layout upload only** (no preferences):
   - ✅ Recommendations NOT generated
   - ✅ Advisor responds conversationally

2. **User asks "what do you recommend?"**:
   - ✅ Recommendations ARE generated
   - ✅ Plan appears

3. **User says "I care about security"** (with layout):
   - ✅ Recommendations ARE generated
   - ✅ Plan appears

4. **User confirms layout details** ("Kitchen is 200 sq ft"):
   - ✅ Recommendations NOT generated
   - ✅ Advisor acknowledges and asks for preferences

5. **User asks follow-up after plan shown**:
   - ✅ Recommendations ARE generated (updating plan)
   - ✅ Plan updates

### Logging:

Check logs for:
- `"generating recommendations (user asked or preferences expressed)"` - When generated
- `"skipping recommendations (not needed yet)"` - When skipped

## Monitoring

Monitor these metrics:
- **LLM call frequency** - Should decrease by ~50%
- **Response times** - Should improve for non-recommendation messages
- **API costs** - Should decrease proportionally
- **User satisfaction** - Should remain the same or improve (faster responses)

## Future Enhancements

Potential improvements:
1. **Cache recommendations** - If layout/preferences haven't changed, reuse previous recommendations
2. **Smarter preference detection** - Use LLM to detect preferences more accurately
3. **Progressive enhancement** - Generate lightweight recommendations first, full recommendations on demand

## Rollback

If issues occur, revert by:
1. Remove `_should_generate_recommendations()` function
2. Restore original code that always calls `recommend_with_llm_fallback()`

The optimization is **backward compatible** - if the function returns `True` (always generate), behavior is identical to before.
