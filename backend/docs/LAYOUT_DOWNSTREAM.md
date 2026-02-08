# Layout downstream — where layout goes after creation

This doc traces **layout** from the moment it is produced (analyze or from_description) through cache, recommender, advisor LLM, API response, and frontend.

---

## 1. Layout creation (upstream)

- **Upload:** `POST /api/v1/layout/analyze` → `analyze_layout_bytes()` → vision LLM or fallback → returns `LayoutAnalysis` (dict via `.model_dump()`).
- **Description:** `POST /api/v1/layout/from_description` → `extract_layout_from_description()` → returns `LayoutAnalysis`.

Both return a **layout dict** with at least: `layout_id`, `layout_type`, `rooms`, `entry_points`, `notes`, `confidence`, and optionally `measurement_units`, `total_area`, `mentioned_spaces_area`, `unassigned_space`, `source_filename`.

---

## 2. Layout cache (advisor API)

**File:** `app/api/v1/advisor.py`

- **Store:** `_LAYOUT_STORE: dict[str, dict]` — in-memory, keyed by `layout_id`.
- **Upsert:** `POST /api/v1/advisor/layout_cache/upsert` — body = full layout dict. Requires `layout_id`. Does `_LAYOUT_STORE[lid] = layout`. Returns `{"ok": True, "layout_id": lid}`.
- **Lifetime:** Until process restart. No persistence.

**Frontend:** After analyze (or from_description), the client calls `upsertLayoutCache(analysis)` so the backend has the layout by id.

---

## 3. Advisor request: loading layout

**File:** `app/api/v1/advisor.py` (both `POST /chat` and `POST /chat/stream`)

1. Request body includes optional `layout_id` (and `customer_id`, `messages`).
2. `layout = {}` by default.
3. If `req.layout_id` is set:
   - `layout = _LAYOUT_STORE.get(req.layout_id, {})`
   - If not in store → **404** with message like "layout_id not found in cache (call /layout/analyze then /advisor/layout_cache/upsert)".
4. Same `layout` dict is then passed to:
   - **Recommender**
   - **Advisor LLM** (via `generate_advisor_response(..., layout=layout, ...)`)
   - **Response** (in `AdvisorChatResponse.layout`).

So **downstream** starts from this **layout** dict (empty or the cached one).

---

## 4. Recommender (layout as input)

**File:** `app/services/recommendation/recommender.py`

- **Signature:** `recommend(profile, layout, product_map, bundles)`.
- **Uses layout for:**
  - **rooms:** `layout.get("rooms", [])` — currently only read; room names in recommendations are fixed ("Whole Home", "Entrance", "Living", "Perimeter"). So layout rooms don’t change which products are suggested; they could be used later for per-room naming.
  - **layout_type:** `layout.get("layout_type") == "villa"` → add outdoor camera at "Perimeter". So **villa** vs non-villa changes recommendations; apartment/office/unknown do not add the outdoor camera.

**Output:** `(recos, bundle_id, estimated_monthly)` — no layout in the return value; layout only influences the list of recommendations and bundle choice.

---

## 5. Advisor LLM context (layout in the prompt)

**File:** `app/services/llm/llm_openai.py`

`generate_advisor_response(..., layout=layout, ...)` builds a **context string** that is appended to the system prompt. Layout is used as follows:

| Layout field | How it’s used |
|--------------|----------------|
| `layout_type` | In context: "Layout type: {layout_type}." |
| `confidence` | Float; drives **layout_status** (no layout / medium / clear). |
| `rooms` | Turned into a **room_list**: for each room, "RoomName W×L×H: ... area: ..." (or estimated_size). Put in context as "Rooms we have: [list]." |
| `entry_points` | In context: "Entry points: [list]." |
| `measurement_units` | If present: "Areas: units: ..., total: ..., named rooms: ..., walls/corridors: ..." |
| `total_area` | Same "Areas" line. |
| `mentioned_spaces_area` | Same. |
| `unassigned_space` | Same. |

**Layout status (derived):**

- No layout or low confidence (`has_layout` false or `conf < 0.5`): "We do not have a clear picture of their space..."; don’t push sales; answer "who are you" directly.
- Medium confidence (`conf < 0.75`): "We have a layout but confidence is medium. First establish that we got it right..."
- High: "We have a clear understanding of their space. You can acknowledge it naturally and then have a genuine sales conversation."

So **downstream**, the LLM never sees raw layout JSON; it sees this **context string** (rooms, type, confidence, areas, entry points, layout_status). Recommendations are passed separately (by room, product name + why).

---

## 6. API response (layout back to client)

**File:** `app/api/v1/advisor.py`

- **AdvisorChatResponse** includes `layout: Dict[str, Any]` — the **same** layout dict that was loaded from `_LAYOUT_STORE` (or `{}`).
- So the client receives the full layout (layout_id, layout_type, rooms, entry_points, notes, confidence, areas, etc.) in every chat response when they had sent `layout_id`.

**Non-stream:** `response.model_dump()` → `layout` is in the JSON.  
**Stream:** Final SSE payload includes `final.layout` — same dict.

---

## 7. Frontend (layout usage)

**ChatPanel** (`e-smart-living-advisor/src/components/ChatPanel.tsx`):

- After upload: `setLayoutId(analysis.layout_id)`; every advisor request sends `layout_id: layoutId ?? undefined`.
- Does **not** re-store layout from chat response; it already has the analysis from `analyzeLayout` and passes `layout_id` so the backend can look it up.

**Index** (`pages/Index.tsx`):

- State: `layout` (LayoutAnalysis | null), `layoutImageUrl`.
- `onLayoutAnalyzed(analysis, imageUrl)` sets layout and optional image URL.
- Renders `<LayoutSummary layout={layout} imageUrl={layoutImageUrl} />` when layout is set; `<SmartHomePlan plan={plan} />` uses `plan.layout` when showing the offered plan.

**LayoutSummary** (`components/LayoutSummary.tsx`):

- Props: `layout: LayoutAnalysis`, `imageUrl?`.
- Displays: layout_type, rooms (name, type, dimensions/area), entry points, notes, confidence, source_filename. Does **not** currently show `measurement_units`, `total_area`, `mentioned_spaces_area`, `unassigned_space` (they are in the type but not rendered).

**SmartHomePlan** (`components/SmartHomePlan.tsx`):

- Receives `plan: AdvisorChatResponse | null`. Uses `plan.layout` only to show **layout_type** in the plan card (e.g. "Villa"). Rest of the plan is recommendations, bundle, price.

**API types** (`lib/api.ts`):

- `LayoutAnalysis` includes optional `layout_id`, `layout_type`, `rooms`, `entry_points`, `notes`, `confidence`, `source_filename`; the extra area fields are not in the TypeScript interface but would be present if the backend sends them.

---

## 8. Downstream summary (flow)

```
Layout created (analyze / from_description)
    → returned to client
    → client calls upsertLayoutCache(layout)
    → _LAYOUT_STORE[layout_id] = layout

Every advisor request with layout_id
    → layout = _LAYOUT_STORE.get(layout_id, {})
    → recommend(profile, layout, ...)     [uses layout_type, rooms]
    → generate_advisor_response(..., layout, ...)   [builds context: rooms, type, confidence, areas, layout_status]
    → response.layout = layout   [same dict back to client]

Frontend
    → sends layout_id on each chat message after upload
    → displays layout in LayoutSummary (from state set at analyze time)
    → displays plan.layout in SmartHomePlan (from advisor response)
```

---

## 9. Gaps / notes

- **Recommender** does not use room names from layout for product placement; it uses fixed room labels. So changing room names in the layout doesn’t change which room a product is assigned to.
- **Layout cache** is process-local and volatile; restart clears it. Frontend must re-upload or re-call from_description and upsert if the user refreshes after a server restart.
- **LayoutSummary** does not show `total_area`, `mentioned_spaces_area`, `unassigned_space`, or `measurement_units`; the data is in the layout and in the LLM context, but not in the UI yet.
- **layoutFromDescription** is implemented in the API and frontend `api.ts`, but the UI does not yet offer a "describe your home" path that calls it and then upserts + sets layoutId.
