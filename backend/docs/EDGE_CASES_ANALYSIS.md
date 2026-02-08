# Edge Cases Analysis: Bidirectional Sync & Dimension Parsing

## Identified Edge Cases

### 1. Ambiguous Room Names ⚠️
**Issue**: Multiple rooms with similar names
- "Bedroom" vs "Bedroom #2" vs "Master Bedroom"
- User says: "Bedroom (200 sq ft)" - which one?

**Current Behavior**: Fuzzy matching might match the first one found
**Risk**: Medium - Could update wrong room

**Fix Needed**: Prefer exact matches, then most specific match

### 2. Multiple Updates in One Message ⚠️
**Issue**: "Kitchen: 300 sq ft, Living Room: 500 sq ft"
**Current Behavior**: Should handle both (loops through patterns)
**Risk**: Low - Should work, but need to verify order

### 3. Conflicting Updates (Same Room Twice) ⚠️
**Issue**: "Kitchen: 300 sq ft, Kitchen: 350 sq ft"
**Current Behavior**: First match wins (processedRooms Set prevents second update)
**Risk**: Low - Last update might be ignored

**Fix Needed**: Track all matches, use last one

### 4. Zero or Negative Values ⚠️
**Issue**: "Kitchen: 0 sq ft" or "Kitchen: -100 sq ft"
**Current Behavior**: `area <= 0` check should skip these
**Risk**: Low - Already handled

### 5. Very Large/Small Numbers ⚠️
**Issue**: "Kitchen: 0.0001 sq ft" or "Kitchen: 999999 sq ft"
**Current Behavior**: No validation
**Risk**: Medium - Could cause calculation errors or UI issues

**Fix Needed**: Add reasonable bounds (e.g., 1-100000 sq ft)

### 6. Decimal Precision ⚠️
**Issue**: "Kitchen: 300.123456789 sq ft"
**Current Behavior**: parseFloat handles it, but rounding might cause issues
**Risk**: Low - Rounding in estimateDimensionsFromArea should help

### 7. Special Characters in Room Names ⚠️
**Issue**: "Room & Hall", "Room (Main)", "Room #1"
**Current Behavior**: Regex might not match correctly
**Risk**: Medium - Pattern `[^:(]+?` should handle most cases

**Test Cases Needed**:
- "Room & Hall (300 sq ft)"
- "Room (Main): 300 sq ft"
- "Room #1: 300 sq ft"

### 8. Empty/Null Room Names ⚠️
**Issue**: Room with `room: null` or `room: ""`
**Current Behavior**: `room.room ?? room.name ?? ""` handles null, but empty string might cause issues
**Risk**: Low - Empty string won't match anything

### 9. Case Sensitivity ⚠️
**Issue**: "kitchen" vs "Kitchen" vs "KITCHEN"
**Current Behavior**: `normalizeRoomName` lowercases everything
**Risk**: Low - Already handled

### 10. Partial Word Matches ⚠️
**Issue**: "Bed" matching "Bedroom" or "Bedroom #2"
**Current Behavior**: Fuzzy matching with word length > 2 check
**Risk**: Medium - "Bed" (3 chars) could match "Bedroom"

**Fix Needed**: Require longer words or exact word boundaries

### 11. Units Mismatch ⚠️
**Issue**: Room in "ft", update says "300 sq m"
**Current Behavior**: Pattern matches both ft and m, but doesn't convert
**Risk**: High - Wrong units could cause major errors

**Fix Needed**: Convert units or warn user

### 12. Aspect Ratio Edge Cases ⚠️
**Issue**: Very long/thin rooms (aspect ratio 10:1) or very wide (1:10)
**Current Behavior**: Preserves aspect ratio, which might create unrealistic dimensions
**Risk**: Medium - 1ft × 300ft room is unrealistic

**Fix Needed**: Cap aspect ratio (e.g., max 5:1)

### 13. Room Name with Numbers ⚠️
**Issue**: "Room 1" vs "Room 10" - "Room 1" might match "Room 10"
**Current Behavior**: String includes check could cause false matches
**Risk**: Medium - "Room 1" includes "Room 1" but also matches "Room 10"

**Fix Needed**: Word boundary matching or exact match preference

### 14. Regex Injection ⚠️
**Issue**: Room name contains regex special chars: "Room (.*)"
**Current Behavior**: Patterns use `[^:(]+?` which should be safe
**Risk**: Low - Character class prevents injection

### 15. Empty Message ⚠️
**Issue**: User sends empty string or whitespace only
**Current Behavior**: `if (!currentLayout) return null` handles null layout
**Risk**: Low - Empty message won't match patterns

### 16. Very Long Room Names ⚠️
**Issue**: 100+ character room names
**Current Behavior**: Should work, but might cause UI issues
**Risk**: Low - Parsing should work, UI might truncate

### 17. Unicode Characters ⚠️
**Issue**: "Cuisine" (French), "ห้อง" (Thai), emojis
**Current Behavior**: JavaScript regex should handle Unicode
**Risk**: Low - Should work, but need to test

### 18. Rapid Updates (Race Conditions) ⚠️
**Issue**: User types quickly, multiple updates before state syncs
**Current Behavior**: State updates are synchronous, cache is async
**Risk**: Medium - Could lose intermediate updates

**Fix Needed**: Debounce or queue updates

### 19. Aspect Ratio Division by Zero ⚠️
**Issue**: `currentLength = 0` causes division by zero
**Current Behavior**: Check `currentLength > 0` before division
**Risk**: Low - Already checked

### 20. Pattern Matching Order ⚠️
**Issue**: Multiple patterns might match same text differently
**Current Behavior**: Patterns processed in order, first match wins
**Risk**: Low - Should be deterministic

## Critical Fixes Needed

### Priority 1: High Risk
1. **Units Mismatch** - Add unit conversion or validation
2. **Ambiguous Room Names** - Improve matching logic (exact > specific > fuzzy)
3. **Partial Word Matches** - Require word boundaries or longer words

### Priority 2: Medium Risk
4. **Very Large/Small Numbers** - Add bounds validation
5. **Aspect Ratio Limits** - Cap aspect ratio (max 5:1)
6. **Conflicting Updates** - Use last update instead of first
7. **Room Name with Numbers** - Better number handling

### Priority 3: Low Risk (Nice to Have)
8. **Rapid Updates** - Debounce mechanism
9. **Special Characters** - More comprehensive testing
10. **Unicode** - Test with various languages

## Test Scenarios

### Test 1: Ambiguous Names
```
Rooms: ["Bedroom", "Bedroom #2", "Master Bedroom"]
Input: "Bedroom (200 sq ft)"
Expected: Should ask which one or update most specific match
```

### Test 2: Units Mismatch
```
Room: Kitchen (in ft)
Input: "Kitchen: 300 sq m"
Expected: Convert or warn (300 sq m = 3229 sq ft)
```

### Test 3: Conflicting Updates
```
Input: "Kitchen: 300 sq ft, Kitchen: 350 sq ft"
Expected: Last value wins (350 sq ft)
```

### Test 4: Extreme Aspect Ratio
```
Room: Hallway (1 × 100 ft)
Input: "Hallway (200 sq ft)"
Expected: Cap aspect ratio, maybe 10 × 20 ft instead of 2 × 100 ft
```

### Test 5: Partial Match
```
Rooms: ["Bedroom", "Bed"]
Input: "Bed (100 sq ft)"
Expected: Match "Bed" exactly, not "Bedroom"
```

### Test 6: Multiple Updates
```
Input: "Kitchen: 300 sq ft, Living Room: 500 sq ft, Bedroom: 200 sq ft"
Expected: All three rooms update correctly
```

### Test 7: Special Characters
```
Room: "Room & Hall"
Input: "Room & Hall (300 sq ft)"
Expected: Match correctly despite &
```

### Test 8: Numbered Rooms
```
Rooms: ["Room 1", "Room 10"]
Input: "Room 1 (100 sq ft)"
Expected: Match "Room 1" exactly, not "Room 10"
```
