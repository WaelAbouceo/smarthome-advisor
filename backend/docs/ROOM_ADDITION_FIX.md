# Room Addition Fix: Area-Only Specifications & Unassigned Space

## Issues Fixed

### Issue 1: Layout Not Updating When Adding Rooms
**Problem**: User typed "please add an extra storage room of 50 ft" but the layout didn't update.

**Root Cause**: The parser only supported `width × length` format (e.g., "50×100"), not area-only specifications (e.g., "50 sq ft" or "50 ft").

**Solution**: Added support for area-only patterns:
- "add storage room of 50 sq ft"
- "add an extra storage room of 50 ft"
- "add room 50 ft" (assumes square feet)

When only area is specified, the system estimates reasonable dimensions using `estimateDimensionsFromArea()` function.

### Issue 2: Adding Rooms Should Reduce Unassigned Space, Not Increase Total Area
**Problem**: When adding a new room, the system was increasing total area instead of reducing unassigned space.

**Root Cause**: The parser wasn't preserving `total_area` when adding rooms.

**Solution**: 
- When adding rooms, `total_area` is now preserved (not modified)
- Unassigned space is automatically recalculated as: `total_area - sum(room areas)`
- This ensures new rooms come from unassigned space, not by increasing total area

## Implementation Details

### New Patterns Added

1. **Area-Only Patterns**:
   ```regex
   /(?:add\s+(?:a\s+|an\s+)?(?:extra\s+)?)?([^:]+?)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:sq\s*)?ft\b/gi
   ```
   - Matches: "add storage room of 50 sq ft", "add an extra storage room of 50 ft"
   - Captures room name and area value
   - Handles "a", "an", "extra" prefixes

2. **Dimension Estimation**:
   ```typescript
   function estimateDimensionsFromArea(area: number): { width: number; length: number }
   ```
   - For small rooms (≤100 sq ft): Creates square-ish dimensions
   - For larger rooms: Creates slightly rectangular dimensions (1.2:1 ratio)
   - Rounds to reasonable values

### Data Flow

```
User Input: "add storage room of 50 sq ft"
    ↓
Parser extracts: room="storage room", area=50
    ↓
Estimates dimensions: width=6.3, length=7.9 (≈50 sq ft)
    ↓
Creates new room with:
  - room_id: "r12"
  - room: "Storage Room"
  - room_type: "other"
  - width: 6.3, length: 7.9, area: 50
    ↓
Updates layout: { ...currentLayout, rooms: [...existingRooms, newRoom] }
    ↓
total_area: UNCHANGED (e.g., 2400 sq ft)
roomsTotalArea: INCREASES (e.g., 1550 → 1600 sq ft)
unassignedSpace: DECREASES (e.g., 850 → 800 sq ft)
```

## Examples

### Example 1: Area-Only Specification
**Input**: "please add an extra storage room of 50 ft"

**Result**:
- New room added: "Storage Room" with area ≈50 sq ft
- Dimensions estimated: ~6.3 × 7.9 ft
- Total area: Unchanged
- Unassigned space: Reduced by ~50 sq ft

### Example 2: Dimension Specification
**Input**: "add garage 50*100"

**Result**:
- New room added: "Garage" with dimensions 50 × 100 ft
- Area: 5000 sq ft
- Total area: Unchanged
- Unassigned space: Reduced by 5000 sq ft

### Example 3: Update Existing Room
**Input**: "Living Room: 20 × 21 ft"

**Result**:
- Existing "Living Room" updated with new dimensions
- Area recalculated: 420 sq ft
- Total area: Unchanged
- Unassigned space: Adjusted based on area change

## Key Features

1. **Flexible Input Formats**:
   - Width × Length: "50×100", "50 × 100", "50*100"
   - Area-only: "50 sq ft", "50 ft"
   - With prefixes: "add", "add a", "add an", "add an extra"

2. **Smart Dimension Estimation**:
   - Small rooms: Square-ish dimensions
   - Large rooms: Slightly rectangular
   - Rounded to reasonable values

3. **Unassigned Space Logic**:
   - New rooms reduce unassigned space
   - Total area never increases when adding rooms
   - Calculation: `unassignedSpace = totalArea - roomsTotalArea`

4. **Room Type Detection**:
   - "storage" → "other"
   - "garage" → "other"
   - "bedroom" → "bedroom"
   - "bathroom" → "bathroom"
   - etc.

## Testing

### Test Case 1: Area-Only Addition
```
Input: "add storage room of 50 sq ft"
Expected:
  - New room: "Storage Room" with area ≈50 sq ft
  - Dimensions estimated automatically
  - Total area unchanged
  - Unassigned space reduced by ~50 sq ft
```

### Test Case 2: Dimension Addition
```
Input: "add garage 50*100"
Expected:
  - New room: "Garage" with 50×100 ft
  - Area: 5000 sq ft
  - Total area unchanged
  - Unassigned space reduced by 5000 sq ft
```

### Test Case 3: Update Existing Room
```
Input: "Living Room: 22 × 21 ft"
Expected:
  - Existing "Living Room" updated
  - Area: 462 sq ft
  - Total area unchanged
  - Unassigned space adjusted
```

## Status

✅ **FIXED AND VERIFIED**

- Area-only specifications now supported
- Unassigned space correctly decreases when rooms are added
- Total area preserved when adding rooms
- Layout updates immediately in panel
