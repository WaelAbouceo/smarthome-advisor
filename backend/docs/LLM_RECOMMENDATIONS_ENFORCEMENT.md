# LLM Recommendations Enforcement - Fix

**Date:** February 8, 2026  
**Status:** ✅ Implemented

## Problem

The LLM advisor was **hallucinating products** instead of using actual recommendations from the catalog:
- Mentioned "Smart TV" (not in catalog) instead of "evision 4K Box"
- Made up prices (500 AED, 800 AED) instead of using catalog prices
- Invented products that don't exist

## Root Cause

1. **Optimization skipped recommendations** when preferences weren't detected (typo: "streamin" vs "streaming")
2. **Advisor decided to offer plan** (`action="offer_plan"`) but had no recommendations
3. **LLM hallucinated** products because it had no actual recommendations to use

## Solution

### 1. Improved Preference Detection (Typo Tolerance)

Added typo tolerance to catch variations:
```python
"entertainment": ["streaming", "streamin", "stream", ...]  # Now catches "streamin"
"wifi": ["wifi", "wi-fi", "wi fi", "strong wifi", ...]   # More variations
```

### 2. On-Demand Recommendation Generation (Safeguard)

**Critical Fix:** If advisor wants to offer plan but recommendations were skipped, generate them immediately:

```python
if action == "offer_plan" and not recos:
    # Generate recommendations on-demand
    recos, bundle_id, est_monthly = recommend_with_llm_fallback(...)
    # Re-generate advisor response with actual recommendations
    result = generate_advisor_response(..., recos=recos, ...)
```

This ensures:
- ✅ LLM always has actual recommendations when offering plan
- ✅ No hallucinated products
- ✅ Uses actual catalog product names and prices

### 3. Enhanced LLM Prompt Enforcement

**Updated `advisor_system.md`:**
- Added explicit instruction: "MUST use ONLY the recommendations provided"
- Added warning: "NEVER invent or hallucinate product names"
- Added instruction: "Use EXACT product names from recommendations"

**Updated `llm_openai.py` context building:**
```python
if by_room:
    context += "CRITICAL: When presenting the plan, you MUST use ONLY these recommendations. Use the EXACT product names shown here. Do NOT invent or hallucinate products..."
else:
    context += "IMPORTANT: No recommendations are available yet. Use action='ask' to understand user preferences before offering a plan."
```

## Changes Made

### Files Modified:

1. **`backend/app/api/v1/advisor.py`**:
   - Added typo tolerance to preference keywords
   - Added on-demand recommendation generation safeguard (both `/chat` and `/chat/stream`)
   - Re-generates advisor response with actual recommendations

2. **`backend/app/services/llm/llm_openai.py`**:
   - Enhanced context building with explicit enforcement
   - Added warning when no recommendations available

3. **`backend/prompts/advisor_system.md`**:
   - Added critical instructions about using ONLY provided recommendations
   - Added warnings against hallucination

## Expected Behavior Now

### Scenario 1: User says "need strong wifi + streamin in living room"
1. ✅ Preference detected ("wifi" + "streamin" → "streaming")
2. ✅ Recommendations generated
3. ✅ Advisor uses actual products: "e& Wi-Fi Mesh Pro", "evision 4K Box"
4. ✅ Uses actual prices: "AED 89/month" (from bundle)

### Scenario 2: Advisor decides to offer plan but recommendations were skipped
1. ✅ Safeguard triggers: generates recommendations on-demand
2. ✅ Re-generates advisor response with actual recommendations
3. ✅ No hallucinated products

### Scenario 3: No recommendations available
1. ✅ Context tells LLM: "Use action='ask' to understand preferences"
2. ✅ LLM won't offer plan without recommendations

## Testing

Test scenarios:
1. ✅ User says "streamin" (typo) → Should detect entertainment preference
2. ✅ User says "need wifi" → Should detect wifi preference
3. ✅ Advisor wants to offer plan → Should have actual recommendations
4. ✅ No recommendations → Should ask for preferences, not hallucinate

## Benefits

- ✅ **No more hallucinated products** - LLM uses actual catalog
- ✅ **Accurate prices** - Uses actual monthly subscription prices
- ✅ **Better preference detection** - Catches typos and variations
- ✅ **Safeguard ensures quality** - Always generates recommendations when needed

## Monitoring

Watch logs for:
- `"generated recommendations on-demand"` - Safeguard triggered
- `"advisor wants to offer plan but no recommendations exist"` - Should be rare
- Check that advisor responses use actual product names from catalog
