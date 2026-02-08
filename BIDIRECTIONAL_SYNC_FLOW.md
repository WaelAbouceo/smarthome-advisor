# Bidirectional Layout Sync Flow

## Simple Rule
**Single source of truth**: `layout` state in `Index.tsx`

## Direction 1: Chat → Layout Panel (CREATE/UPDATE/REMOVE rooms)

### Flow:
1. User types in chat: "add garage 50*100" or "Living Room: 20 × 21 ft"
2. `ChatPanel.handleSend()` → `parseDimensionUpdates(message, currentLayout)`
3. If update found → `onLayoutUpdate(updated)` called
4. `Index.handleLayoutChange(updated)` → `setLayout(updated)`
5. `LayoutSummary` receives `layout={layout}` prop → **UI updates**

### Code Path:
```
ChatPanel.handleSend()
  → parseDimensionUpdates() [utils/roomParsing.ts]
  → onLayoutUpdate(updated) [prop from Index]
  → Index.handleLayoutChange(updated)
  → setLayout(updated) [state update]
  → LayoutSummary re-renders with new layout
```

## Direction 2: Layout Panel → Chat (UPDATE rooms)

### Flow:
1. User edits room in LayoutSummary (name, type, width, length)
2. `LayoutSummary.updateRoom()` → `onLayoutChange({ ...layout, rooms: nextRooms })`
3. `Index.handleLayoutChange(updated)` → `setLayout(updated)`
4. `ChatPanel` receives `currentLayout={layout}` prop
5. Next chat message uses `currentLayout` → **Chat uses updated layout**

### Code Path:
```
LayoutSummary.updateRoom()
  → onLayoutChange({ ...layout, rooms: nextRooms }) [prop from Index]
  → Index.handleLayoutChange(updated)
  → setLayout(updated) [state update]
  → ChatPanel receives currentLayout={layout}
  → Next message uses currentLayout for parsing
```

## Key Components

### Index.tsx (State Manager)
- **State**: `const [layout, setLayout] = useState<LayoutAnalysis | null>(null)`
- **Handler**: `handleLayoutChange(updated)` → `setLayout(updated)` + cache update
- **Props to ChatPanel**: `currentLayout={layout}`, `onLayoutUpdate={handleLayoutChange}`
- **Props to LayoutSummary**: `layout={layout}`, `onLayoutChange={handleLayoutChange}`

### ChatPanel.tsx (Chat Interface)
- **Receives**: `currentLayout` (current state), `onLayoutUpdate` (callback to update)
- **On user message**: Parse → Update → Call `onLayoutUpdate(updated)`
- **Uses**: `currentLayout` for parsing dimension updates

### LayoutSummary.tsx (Layout Editor)
- **Receives**: `layout` (current state), `onLayoutChange` (callback to update)
- **On user edit**: Update room → Call `onLayoutChange(updated)`
- **Displays**: `layout.rooms` array

## Operations Supported

### CREATE (Add Room)
- **Chat**: "add garage 50*100" → `parseDimensionUpdates` adds new room → `onLayoutUpdate`
- **Panel**: Not directly supported (users edit existing rooms)

### UPDATE (Modify Room)
- **Chat**: "Living Room: 20 × 21 ft" → `parseDimensionUpdates` updates room → `onLayoutUpdate`
- **Panel**: User edits name/type/width/length → `updateRoom` → `onLayoutChange`

### REMOVE (Delete Room)
- **Chat**: Not currently supported (would need "remove garage" parsing)
- **Panel**: Not currently supported (would need delete button)

## Cache Sync

Both directions update backend cache:
- `Index.handleLayoutChange()` → `api.upsertLayoutCache(updated)`
- Ensures backend has latest layout for advisor responses

## Potential Issues

1. **Race Condition**: Backend response might overwrite local updates
   - **Fix**: `lastLocalUpdateRef` tracks local updates, prevents overwrite

2. **State Not Updating**: React state updates are async
   - **Fix**: Both components use props directly, state updates trigger re-renders

3. **Cache Stale**: Backend might use old cached layout
   - **Fix**: Cache updated immediately in `handleLayoutChange`

## Verification Checklist

- [x] Chat → Panel: User adds room via chat, appears in panel
- [x] Chat → Panel: User updates room via chat, panel reflects change
- [x] Panel → Chat: User edits room in panel, chat uses updated layout
- [x] Cache sync: Both directions update backend cache
- [x] No overwrite: Backend responses don't overwrite local updates
