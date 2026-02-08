# Layout Synchronization Flow

## Overview
The chat and "Your layout" panel share a single source of truth for room dimensions. Updates in either place are reflected in both immediately.

## Data Flow

### 1. Upload Flow
```
User uploads file (ChatPanel)
  → api.analyzeLayout(file)
  → api.upsertLayoutCache(analysis) [backend cache]
  → setLayoutId(analysis.layout_id) [ChatPanel state]
  → onLayoutAnalyzed(analysis, imageUrl) [Index callback]
  → setLayout(analysis) [Index state]
  → LayoutSummary displays layout
  → runStream({ layout_id }) [sends to advisor]
```

### 2. Panel Edit Flow
```
User edits room in LayoutSummary
  → updateRoom(index, patch)
  → onLayoutChange(updated) [Index callback]
  → handleLayoutChange(updated)
    → setLayout(updated) [Index state - panel updates immediately]
    → api.upsertLayoutCache(updated) [backend cache]
  → Next advisor message uses updated layout from cache
```

### 3. Chat Dimension Update Flow
```
User types "Living Room: 20 × 21 ft" in chat
  → handleSend()
  → parseDimensionUpdates(message, currentLayout)
    → Finds "Living Room" (fuzzy match)
    → Extracts 20×21
    → Returns updated layout with width=20, length=21, area=420
  → onLayoutUpdate(updated) [Index callback]
    → handleLayoutChange(updated)
      → setLayout(updated) [Index state - panel updates immediately]
      → api.upsertLayoutCache(updated) [backend cache]
  → await upsertLayoutCache [ensures cache updated before send]
  → runStream({ layout_id: updated.layout_id })
  → Backend loads updated layout from cache
  → Advisor response includes updated layout
  → onLayoutFromChat(response.layout) [syncs panel to what advisor used]
```

### 4. Advisor Response Flow
```
Backend receives request with layout_id
  → layout = _LAYOUT_STORE.get(layout_id) [from cache]
  → generate_advisor_response(layout=layout, ...)
  → Returns AdvisorChatResponse(layout=layout, ...)
  → Frontend receives response
  → onLayoutFromChat(final.layout) [Index callback]
  → setLayout(final.layout) [Index state]
  → LayoutSummary displays exactly what advisor used
```

## Key Synchronization Points

1. **Index State (`layout`)** - Single source of truth for UI display
2. **Backend Cache (`_LAYOUT_STORE`)** - Single source of truth for advisor
3. **ChatPanel State (`layoutId`)** - Tracks which layout to send with messages

## Update Triggers

- **Panel → Chat**: User edits in LayoutSummary → `onLayoutChange` → Index updates state + cache → next message uses updated layout
- **Chat → Panel**: User types dimensions → parser updates layout → `onLayoutUpdate` → Index updates state + cache → panel refreshes
- **Advisor → Panel**: Advisor response includes layout → `onLayoutFromChat` → Index updates state → panel shows what advisor used

## Race Condition Prevention

- Cache updates are awaited before sending messages (in `handleSend`)
- Layout state updates happen synchronously before cache updates
- Advisor responses always include the layout they used, so panel stays in sync

## Edge Cases Handled

1. **Fuzzy room name matching**: "Kitchen / Dining" matches "Kitchen/Dining"
2. **Multiple dimension formats**: "20 × 21 ft", "20×21", "20 x 21 → 420 sq ft"
3. **LayoutId sync**: ChatPanel's `layoutId` state syncs when `currentLayout` changes
4. **Cache update failures**: Non-blocking, message still sent (best-effort)
