# Plan Update Flow - Dynamic Recommendations

## Overview

The "Your plan" panel now updates dynamically as the conversation progresses, not just when `action === "offer_plan"`.

## How It Works

### 1. Plan Updates on Every Recommendation

**Before:** Plan only updated when `action === "offer_plan"`

**Now:** Plan updates whenever `recommended_products` array has items, regardless of `action`

### 2. Update Logic

In `ChatPanel.tsx`:
```typescript
// Update plan whenever recommendations are present
if (final.recommended_products && final.recommended_products.length > 0) {
  onPlanGenerated?.(final);
} else if (final.action === "offer_plan") {
  // Also update if action is offer_plan (even if no products yet)
  onPlanGenerated?.(final);
}
```

### 3. Tab Behavior

- **First time:** Auto-switches to "Your plan" tab when recommendations first appear
- **Subsequent updates:** Plan updates in place, tab stays where user left it
- **User control:** User can manually switch tabs anytime

## Example Flow

### Conversation 1:
**User:** "What do you recommend?"  
**Response:** `action: "offer_plan"`, `recommended_products: [...]`  
**Result:** Plan appears, tab switches to "Your plan"

### Conversation 2:
**User:** "I want to focus more on security"  
**Response:** `action: "ask"`, `recommended_products: [updated list]`  
**Result:** Plan updates with new security-focused recommendations, tab stays on "Your plan"

### Conversation 3:
**User:** "Add a TV box for streaming"  
**Response:** `action: "offer_plan"`, `recommended_products: [includes TV box]`  
**Result:** Plan updates to include TV box, user sees it immediately

## Benefits

1. **Real-time Updates:** Plan reflects latest recommendations as conversation evolves
2. **User Control:** Tab doesn't jump around after first plan
3. **Smooth UX:** Plan updates in place, no jarring tab switches
4. **Flexible:** Works with both `action: "offer_plan"` and `action: "ask"` responses

## Technical Details

### State Management

- `plan` state in `Index.tsx` updates whenever `onPlanGenerated` is called
- `SmartHomePlan` component receives updated `plan` prop and re-renders
- React's reconciliation handles smooth updates

### Update Triggers

Plan updates when:
1. `recommended_products` array has items (primary trigger)
2. `action === "offer_plan"` (fallback for edge cases)

### Tab Switching

- `hasShownPlan` flag tracks if plan has been shown before
- Only auto-switches on first plan generation
- User can manually switch tabs anytime

## Testing

### Test Scenario 1: Initial Plan
1. Upload layout
2. Ask: "What do you recommend?"
3. ✅ Plan appears, tab switches to "Your plan"

### Test Scenario 2: Plan Update
1. Plan is already showing
2. Ask: "I want more security products"
3. ✅ Plan updates with new recommendations, tab stays on "Your plan"

### Test Scenario 3: User Switches Tabs
1. Plan is showing
2. User switches to "Your layout" tab
3. Ask: "Add a garage"
4. ✅ Plan updates, but tab stays on "Your layout" (user's choice)

## Future Enhancements

- [ ] Visual indicator when plan updates (subtle animation)
- [ ] "Plan updated" notification (optional)
- [ ] Compare old vs new recommendations
- [ ] Undo/redo plan changes
