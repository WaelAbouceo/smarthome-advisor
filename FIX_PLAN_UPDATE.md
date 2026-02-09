# Fix: Plan Not Updating During Conversation

## Problem
The "Your plan" panel was static and not updating as the conversation progressed.

## Root Cause
1. Frontend only updated plan when `action === "offer_plan"`
2. React might not detect changes if object reference is the same
3. Backend always returns recommendations, but they might be the same if conversation doesn't change context

## Solution Applied

### 1. Frontend: Always Update Plan
**File:** `e-smart-living-advisor/src/components/ChatPanel.tsx`

**Changed:**
- Plan now updates whenever `recommended_products` is present OR `action === "offer_plan"`
- This ensures plan updates on every response with recommendations

**Code:**
```typescript
// Always update plan whenever we have recommendations OR action is offer_plan
if (final && ((final.recommended_products && final.recommended_products.length > 0) || final.action === "offer_plan")) {
  onPlanGenerated?.(final);
}
```

### 2. Frontend: Force React Re-render
**File:** `e-smart-living-advisor/src/pages/Index.tsx`

**Changed:**
- Create new object reference when updating plan: `setPlan({ ...res })`
- Use key prop to force re-render: `key={plan.answer + (plan.recommended_products?.length || 0)}`

**Code:**
```typescript
onPlanGenerated={(res) => {
  // Always update plan - create new object reference to ensure React detects change
  setPlan({ ...res }); // Spread to create new object reference
}}

// In render:
<SmartHomePlan 
  key={plan.answer + (plan.recommended_products?.length || 0)} 
  isVisible={!!plan} 
  plan={plan} 
/>
```

### 3. Backend: Already Returns Recommendations
**File:** `backend/app/api/v1/advisor.py`

**Status:** ✅ Already correct
- Backend ALWAYS generates recommendations for every request (line 99-111)
- Backend ALWAYS includes `recommended_products` in response (line 203)
- LLM recommender receives conversation history and should adapt

## How It Works Now

### Flow:
1. User sends message
2. Backend generates recommendations (with RAG + LLM, using conversation history)
3. Backend returns response with `recommended_products`
4. Frontend detects recommendations and calls `onPlanGenerated`
5. Plan state updates with new object reference
6. React detects change (via key prop) and re-renders `SmartHomePlan`
7. Plan displays updated recommendations

### Example:
**Message 1:** "What do you recommend?"
- Response: Recommendations A
- Plan shows: Recommendations A

**Message 2:** "I want more security"
- Response: Updated recommendations B (more security products)
- Plan updates: Shows Recommendations B

**Message 3:** "Add a TV box"
- Response: Updated recommendations C (includes TV box)
- Plan updates: Shows Recommendations C

## Testing

### Test 1: Initial Plan
1. Upload layout
2. Ask: "What do you recommend?"
3. ✅ Plan appears with recommendations

### Test 2: Plan Update
1. Plan is showing
2. Ask: "I want more security products"
3. ✅ Plan updates with new security-focused recommendations

### Test 3: Multiple Updates
1. Plan is showing
2. Ask: "Add a TV box"
3. ✅ Plan updates to include TV box
4. Ask: "Remove the outdoor camera"
5. ✅ Plan updates to remove outdoor camera

## Verification

### Check Frontend Console:
- No errors
- `onPlanGenerated` should be called on every response with recommendations

### Check Backend Logs:
- `Using LLM-generated recommendations` should appear
- Recommendations count might change between requests

### Check Network Tab:
- `/api/v1/advisor/chat` responses should include `recommended_products`
- `recommended_products` array should potentially change between requests

## If Plan Still Doesn't Update

### Debug Steps:

1. **Check if recommendations are changing:**
   ```javascript
   // In browser console, check network responses
   // Compare recommended_products between requests
   ```

2. **Check if onPlanGenerated is called:**
   ```typescript
   // Add console.log in Index.tsx
   onPlanGenerated={(res) => {
     console.log("Plan updated:", res.recommended_products);
     setPlan({ ...res });
   }}
   ```

3. **Check if React detects change:**
   ```typescript
   // Add useEffect in SmartHomePlan.tsx
   useEffect(() => {
     console.log("SmartHomePlan re-rendered", plan?.recommended_products);
   }, [plan]);
   ```

4. **Check backend recommendations:**
   - Verify LLM recommender is receiving conversation history
   - Check if recommendations actually change based on conversation
   - Verify RAG is retrieving relevant knowledge

## Future Enhancements

- [ ] Add visual indicator when plan updates (subtle animation)
- [ ] Show "Plan updated" notification
- [ ] Compare old vs new recommendations (highlight changes)
- [ ] Add undo/redo for plan changes
