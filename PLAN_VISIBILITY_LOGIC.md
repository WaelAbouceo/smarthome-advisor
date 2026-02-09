# Plan Visibility Logic - When "Your Smart Home Plan" Appears

## Current Flow

### Backend:
1. **Always generates recommendations** based on:
   - CRM profile flags (`security_sensitive`, `streaming_heavy`, etc.)
   - Layout (if uploaded)
   - Conversation history (for LLM recommender)

2. **LLM decides `action`:**
   - `action: "ask"` → Still understanding preferences, asking questions
   - `action: "offer_plan"` → Ready to show recommendations

3. **Response always includes `recommended_products`** (even when `action: "ask"`)

### Frontend:
- **Before fix:** Showed plan whenever `recommended_products` existed
- **After fix:** Only shows plan when `action === "offer_plan"`

---

## Why This Matters

### Problem:
- Plan appeared immediately based on CRM profile flags
- User didn't express preferences yet
- Felt like "jumping to sales" before understanding needs

### Solution:
- Plan only appears when LLM decides `action: "offer_plan"`
- LLM only sets `action: "offer_plan"` when:
  1. Layout is confirmed
  2. User preferences are understood from conversation

---

## Flow Example

### Scenario 1: User uploads layout, no preferences yet
**User:** Uploads floor plan  
**Backend:** Generates recommendations (based on CRM profile)  
**LLM:** `action: "ask"` - "What matters most to you - security, entertainment, or something else?"  
**Frontend:** Plan NOT shown (action is "ask")

### Scenario 2: User expresses preferences
**User:** "I care about security and want powerful Wi-Fi"  
**Backend:** Generates updated recommendations (based on conversation + profile)  
**LLM:** `action: "offer_plan"` - Shows recommendations  
**Frontend:** Plan SHOWN (action is "offer_plan")

### Scenario 3: User asks for changes
**User:** "Add a TV box"  
**Backend:** Generates updated recommendations  
**LLM:** `action: "offer_plan"` - Shows updated plan  
**Frontend:** Plan UPDATED (action is "offer_plan")

---

## Implementation

### Frontend Logic:
```typescript
// Only show plan when LLM decides to offer it
if (final && final.action === "offer_plan") {
  onPlanGenerated?.(final); // Show plan
} else {
  // Don't show plan, even if recommendations exist
  // LLM is still asking questions (action: "ask")
}
```

### Backend Logic:
- Recommendations are always generated (for LLM context)
- LLM uses recommendations to understand what to suggest
- LLM decides when to show them (`action: "offer_plan"`)

---

## Benefits

1. **Better UX:** Plan appears only when ready, not prematurely
2. **Follows prompt:** Aligns with "layout confirmed + preferences understood"
3. **User feels heard:** Plan appears after expressing needs, not from CRM data
4. **Natural flow:** Ask → Understand → Offer

---

## Testing

### Test 1: Initial upload
1. Upload layout
2. ✅ Plan should NOT appear (LLM should ask about preferences)
3. Check `action` in response - should be "ask"

### Test 2: After expressing preferences
1. Upload layout
2. User: "I want security and streaming"
3. ✅ Plan should appear (LLM sets `action: "offer_plan"`)

### Test 3: Plan updates
1. Plan is showing
2. User: "Add TV box"
3. ✅ Plan should update (still `action: "offer_plan"`)

---

## Notes

- Backend still generates recommendations early (for LLM context)
- Frontend only displays when `action: "offer_plan"`
- This ensures plan appears at the right time in the conversation flow
