# LLM-Driven Layout Updates

## Overview

The system now uses the LLM to handle layout updates instead of relying solely on frontend parsing. This simplifies the codebase and makes the system more natural and flexible.

## Why This Change?

**Previous Approach:**
- Complex regex-based parser in frontend (`utils/roomParsing.ts`)
- Had to handle many edge cases (typos, formats, "missing room" phrases)
- Parser logic duplicated natural language understanding that LLM already does
- User asked: "why parser why the llm doesnt handle this???"

**New Approach:**
- LLM detects layout changes from natural language
- LLM returns updated layout in response
- Frontend parser kept as fallback for immediate UI feedback
- Single source of truth: LLM's understanding

## How It Works

### 1. LLM Prompt (`backend/prompts/advisor_system.md`)

Added section 7 "Layout Updates" that instructs the LLM to:
- Detect when user mentions adding/removing/updating rooms
- Return optional `layout_updates` field in JSON response
- Preserve existing layout fields (layout_id, measurement_units, etc.)
- Handle natural phrases like "missing a garage", "add storage room", "Kitchen is 300 sq ft"

### 2. LLM Response Format (`backend/app/services/llm/llm_openai.py`)

Updated `AdvisorResult` type to include layout updates:
```python
AdvisorResult = Tuple[str, str, Dict[str, Any] | None]  # (reply, action, layout_updates)
```

The LLM response JSON can now include:
```json
{
  "reply": "...",
  "action": "ask" or "offer_plan",
  "layout_updates": {
    "rooms": [...],
    "total_area": "...",
    "layout_type": "..."
  }
}
```

### 3. API Merging (`backend/app/api/v1/advisor.py`)

Both `/chat` and `/chat/stream` endpoints now:
- Extract `layout_updates` from LLM response
- Merge updates into existing layout (preserving layout_id, etc.)
- Update `_LAYOUT_STORE` cache
- Return updated layout in response

### 4. Frontend (`e-smart-living-advisor/src/components/ChatPanel.tsx`)

- **Parser is now fallback only**: Used for immediate UI feedback before LLM responds
- **LLM updates are authoritative**: When LLM returns layout, it takes priority
- **Simplified logic**: No more complex race condition handling between parser and backend

## Benefits

1. **Simpler**: Less parsing code, fewer edge cases to handle
2. **More Natural**: LLM understands "missing a garage" naturally, no regex needed
3. **Flexible**: Handles any phrasing the user uses
4. **Single Source of Truth**: LLM's understanding is authoritative
5. **Maintainable**: One place (prompt) to improve layout understanding

## Example Flow

**User says:** "we are missing a garage and storage room"

**Before:**
1. Frontend parser tries to match regex patterns
2. May miss variations or typos
3. Complex logic to handle "missing" phrase

**Now:**
1. LLM sees the message and understands intent
2. LLM returns:
   ```json
   {
     "reply": "Got it! I've added a garage and storage room to your layout...",
     "action": "ask",
     "layout_updates": {
       "rooms": [
         ...existing rooms...,
         {"name": "Garage", "type": "other", "width": 14, "length": 14, "area": 196},
         {"name": "Storage Room", "type": "other", "width": 7, "length": 7, "area": 49}
       ]
     }
   }
   ```
3. Backend merges updates into layout
4. Frontend receives updated layout and displays it

## Migration Notes

- Parser (`utils/roomParsing.ts`) is still present as fallback
- Can be removed later if LLM proves reliable
- Frontend still calls parser for immediate feedback, but LLM response is authoritative

## Testing

Test cases that now work naturally via LLM:
- "missing a garage" → adds garage
- "add storage room of 50 ft" → adds storage with estimated dimensions
- "Kitchen / Dining (300 sq ft)" → updates existing room
- "Living Room: 20 × 21 ft" → updates dimensions
- Any natural language variation
