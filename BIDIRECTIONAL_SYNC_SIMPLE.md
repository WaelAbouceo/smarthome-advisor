# Bidirectional Layout Sync - Simple Flow

## Core Principle
**Single source of truth**: `layout` state in `Index.tsx`

Both ChatPanel and LayoutSummary read from and write to this same state.

## Flow Diagram

```
┌─────────────────┐                    ┌──────────────────┐
│   ChatPanel     │                    │  LayoutSummary   │
│                 │                    │                  │
│  User types:    │                    │  User edits:     │
│  "add garage"   │                    │  Room name/      │
│  "50*100"       │                    │  dimensions      │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         │ parseDimensionUpdates()             │ updateRoom()
         │                                      │
         │ onLayoutUpdate(updated)              │ onLayoutChange(updated)
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │   Index.tsx       │
              │                   │
              │ handleLayoutChange│
              │   (updated)       │
              │                   │
              │ setLayout(updated)│
              │                   │
              │ + cache update    │
              └─────────┬─────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
┌─────────────────┐          ┌──────────────────┐
│   ChatPanel     │          │  LayoutSummary   │
│                 │          │                  │
│ currentLayout   │          │ layout prop      │
│ prop updates    │          │ updates          │
│                 │          │                  │
│ Next message    │          │ UI shows new     │
│ uses updated    │          │ room/changes     │
│ layout          │          │                  │
└─────────────────┘          └──────────────────┘
```

## Direction 1: Chat → Panel (CREATE/UPDATE rooms)

**User Action**: Types "add garage 50*100" in chat

**Flow**:
1. `ChatPanel.handleSend()` receives message
2. `parseDimensionUpdates(message, currentLayout)` parses and creates updated layout
3. `onLayoutUpdate(updated)` called → `Index.handleLayoutChange(updated)`
4. `setLayout(updated)` updates state
5. `LayoutSummary` receives `layout={layout}` prop → **UI updates immediately**

**Result**: New room appears in "Your layout" panel

## Direction 2: Panel → Chat (UPDATE rooms)

**User Action**: Edits room name/dimensions in LayoutSummary

**Flow**:
1. `LayoutSummary.updateRoom()` called when user edits
2. `onLayoutChange({ ...layout, rooms: nextRooms })` called → `Index.handleLayoutChange(updated)`
3. `setLayout(updated)` updates state
4. `ChatPanel` receives `currentLayout={layout}` prop
5. Next chat message uses `currentLayout` for parsing → **Chat uses updated layout**

**Result**: Chat uses the edited room data for next message

## Operations Supported

### ✅ CREATE (Add Room)
- **Chat**: "add garage 50*100" → Parsed → Added to layout → Panel shows it
- **Panel**: Not directly supported (users edit existing rooms)

### ✅ UPDATE (Modify Room)
- **Chat**: "Living Room: 20 × 21 ft" → Parsed → Room updated → Panel reflects change
- **Panel**: User edits name/type/width/length → State updated → Chat uses it

### ❌ REMOVE (Delete Room)
- **Chat**: Not currently supported (would need "remove garage" parsing)
- **Panel**: Not currently supported (would need delete button)

## Key Code Locations

### State Management
- **File**: `e-smart-living-advisor/src/pages/Index.tsx`
- **State**: `const [layout, setLayout] = useState<LayoutAnalysis | null>(null)`
- **Handler**: `handleLayoutChange(updated)` → Updates state + cache

### Chat → Panel
- **File**: `e-smart-living-advisor/src/components/ChatPanel.tsx`
- **Function**: `handleSend()` → `parseDimensionUpdates()` → `onLayoutUpdate()`
- **Parser**: `e-smart-living-advisor/src/utils/roomParsing.ts`

### Panel → Chat
- **File**: `e-smart-living-advisor/src/components/LayoutSummary.tsx`
- **Function**: `updateRoom()` → `onLayoutChange()`

## Protection Against Overwrites

**Issue**: Backend response might overwrite user's local changes

**Solution**: `lastLocalUpdateRef` tracks when user makes changes via chat
- If user just added/updated room → Don't overwrite with backend response
- Backend response only used if no local update exists

## Verification

To verify sync works:

1. **Chat → Panel**: Type "add garage 50*100" → Check if garage appears in panel ✅
2. **Panel → Chat**: Edit room width in panel → Type "list rooms" → Check if chat shows updated width ✅
3. **Both**: Edit in panel, then add room in chat → Both should be visible ✅

## Summary

The logic is simple:
- **One state** (`layout` in Index.tsx)
- **Two inputs** (ChatPanel and LayoutSummary)
- **One handler** (`handleLayoutChange`)
- **Both read** from state via props
- **Both write** to state via callbacks

That's it! 🎯
