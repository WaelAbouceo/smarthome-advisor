# Smart Home Advisor — Full Repo Review (Step-by-Step Logic)

This document walks through the entire repository logic so you can verify behavior and debug issues.

---

## 1. Repository structure

```
smarthome-advisor/
├── backend/                    # FastAPI app
│   ├── app/
│   │   ├── main.py             # App factory, CORS, middleware, startup (clear prompt cache)
│   │   ├── api/router.py       # Mounts all v1 routes under /api/v1
│   │   ├── api/v1/             # Health, profile, products, layout, advisor
│   │   ├── core/               # config, logging, prompts
│   │   ├── models/             # Pydantic: advisor, layout, profile, product
│   │   ├── repositories/       # CRM (profiles), Product (catalog) — file-based
│   │   └── services/           # persona, recommendation, layout, llm
│   ├── prompts/                # Configurable prompts (.md)
│   ├── docs/                   # SYSTEM_FLOW.md, this file
│   └── data/                   # Not in repo; config points to repo_root/data
├── data/                       # mock_crm_profiles.json, product_catalog.json
└── e-smart-living-advisor/     # Vite + React frontend
```

**Config (backend):** `app/core/config.py` loads `.env` from `backend/.env`. Key settings: `openai_api_key`, `prompts_dir` = `backend/prompts`, `data_dir` = repo root `data/`, `resolved_mock_crm_file()` / `resolved_product_catalog_file()`.

---

## 2. Request entry (backend)

1. **main.py**  
   - `create_app()`: adds `RequestLoggingMiddleware` (request_id, duration log), then CORS (origins from settings or `CORS_ORIGINS` env), then `api_router`.  
   - `GET /` → `{ "app", "docs", "health" }`.  
   - **Startup:** `clear_prompt_cache()` so prompt file changes are picked up after restart.

2. **api/router.py**  
   - Prefix: `/api/v1`.  
   - Mounts: health (no prefix), profile (`/profile`), products (`/products`), layout (`/layout`), advisor (`/advisor`).

So: `GET /api/v1/health`, `POST /api/v1/advisor/chat`, etc.

---

## 3. API endpoints — step by step

### 3.1 Health — `GET /api/v1/health`

- **File:** `app/api/v1/health.py`  
- **Logic:** Returns `{ "status": "ok", "openai_configured": bool(settings.openai_api_key) }`.  
- **Use:** Frontend/ops can check backend and whether OpenAI is configured.

---

### 3.2 Profile — `GET /api/v1/profile/{customer_id}`

- **File:** `app/api/v1/profile.py`  
- **Steps:**  
  1. `crm.get_profile(customer_id)` → dict from `data/mock_crm_profiles.json` keyed by `customer_id`.  
  2. If missing → 404.  
  3. `build_persona(profile)` → Persona (traits, priorities, budget_hint).  
  4. Return `{ "profile": p, "persona": persona.model_dump() }`.

**CRM repo:** `app/repositories/crm_repo.py` — reads JSON once (cached), `get_profile(id)` returns one profile or None.

**Persona:** `app/services/persona/persona_builder.py` — builds from `profile.usage` (security_sensitive, streaming_heavy, work_from_home) and `profile.segment`; sets traits, priorities, budget_hint ("Premium" / "Value"), persona_label.

---

### 3.3 Products — `GET /api/v1/products/catalog`

- **File:** `app/api/v1/products.py`  
- **Logic:** `ProductRepository().get_catalog()` → full catalog from `data/product_catalog.json` (products + bundles). No auth.

**Product repo:** `app/repositories/product_repo.py` — same file, cached. `get_product_map()` returns `{ product_id: product }`.

---

### 3.4 Layout — two flows

#### A. Upload (image/PDF) — `POST /api/v1/layout/analyze`

- **File:** `app/api/v1/layout.py`  
- **Steps:**  
  1. Receive multipart file; require non-empty filename and content.  
  2. `analyze_layout_bytes(filename, content)` in `app/services/layout/layout_analyzer.py`.

**layout_analyzer.py:**

1. Try: `from layout_vision import analyze_layout_with_vision` → call it with `(filename, content)`.  
2. If it returns a `LayoutAnalysis` → return it.  
3. If it raises or returns None (no API key, bad file, parse error):  
   - Return **fallback** layout: `layout_id = "layout_" + sha1(content)[:10]`, `layout_type="unknown"`, `rooms=[]`, `entry_points=[]`, `confidence=0.0`, notes telling user to describe home in chat. **No LLM in this path.**

**layout_vision.py (when OpenAI key set):**

1. Infer media type from filename/bytes (PNG, JPEG, WebP, PDF).  
2. If PDF: render first page to PNG (PyMuPDF), use that image.  
3. Reject if empty or size > 20 MB.  
4. Build base64 data URL of image.  
5. **Prompt:** `get_prompt("layout_vision")` or inline fallback (same text as `prompts/layout_vision.md`).  
6. Call **gpt-4o** with one user message: [text prompt, image_url].  
7. Parse JSON from response (strip markdown fences if present).  
8. Normalize: layout_type, rooms (room name, type, width, length, height, area, size_confidence), entry_points, notes, layout_confidence, measurement_units, total_area, mentioned_spaces_area, unassigned_space.  
9. `layout_id = "layout_" + sha1(original_content_bytes)[:10]`.  
10. Return `LayoutAnalysis(...)`.  
11. On JSON/API error → return None → analyzer uses fallback.

#### B. From description (text) — `POST /api/v1/layout/from_description`

- **File:** `app/api/v1/layout.py`  
- **Body:** `{ "description": "..." }`.  
- **Steps:**  
  1. Validate description non-empty.  
  2. `extract_layout_from_description(description)` in `app/services/layout/layout_description.py`.  
  3. If None → 503 (API key required).  
  4. Return `analysis.model_dump()`.

**layout_description.py:**

1. **Prompt:** `get_prompt("layout_description")` or inline fallback (same as `prompts/layout_description.md`).  
2. Call **gpt-4o-mini** with system + user message (customer description).  
3. Parse JSON (same shape as vision: measurement_units, layout_type, rooms, total_area, mentioned_spaces_area, unassigned_space, entry_points, notes).  
4. `layout_id = "layout_desc_" + sha1(description)[:12]`.  
5. Return `LayoutAnalysis(...)` or None on error.

**Frontend:** `api.analyzeLayout(file)` is used on upload. `api.layoutFromDescription(description)` exists in `api.ts` but is **not** used in ChatPanel/Index today — so “from description” is backend-ready; UI only uses file upload.

---

### 3.5 Advisor — chat and stream

#### In-memory layout store

- **File:** `app/api/v1/advisor.py`  
- `_LAYOUT_STORE: dict[str, dict]` = layout_id → layout dict.  
- **Upsert:** `POST /api/v1/advisor/layout_cache/upsert` with body = full layout dict. Requires `layout_id`. Stores `_LAYOUT_STORE[lid] = layout`.

#### Non-streaming — `POST /api/v1/advisor/chat`

1. **Profile:** `crm.get_profile(req.customer_id)`. Missing → 404.  
2. **Persona:** `build_persona(profile)`.  
3. **Catalog:** `prod.get_catalog()`, `prod.get_product_map()`, `bundles = catalog["bundles"]`.  
4. **Layout:** If `req.layout_id`: `layout = _LAYOUT_STORE.get(req.layout_id, {})`. If key present but not in store → 404. If no layout_id → `layout = {}`.  
5. **Recommend:** `recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)`.  
6. **LLM:** `generate_advisor_response(persona, layout, messages, recos, bundle_id, estimated_monthly, product_names)` in `llm_openai.py`. Returns `(reply, action)` or None.  
7. If None → 503 (Advisor temporarily unavailable; ensure OPENAI_API_KEY).  
8. Log last user message + reply + action.  
9. Build `AdvisorChatResponse(answer=reply, persona, layout, recommended_products=recos, recommended_bundle_id, estimated_monthly, action)` and return `response.model_dump()`.

#### Streaming — `POST /api/v1/advisor/chat/stream`

- Same steps 1–7 as non-streaming (profile, persona, layout, recommend, LLM).  
- Then: build `final` = same `AdvisorChatResponse` as above.  
- **Stream:** `EventSourceResponse` that yields SSE events:  
  - For each chunk from `stream_text(reply, chunk_size=36, delay_s=0.01)`: `{"partial_content": chunk}`.  
  - Then one event: `{"end_of_stream": true, "final": final}` (full response for client to replace streamed text and read action/bundle).  
- `stream_text` (llm_stub) chunks on word boundaries so markdown doesn’t break mid-token.

---

## 4. Recommender logic

**File:** `app/services/recommendation/recommender.py`

- **Input:** profile (dict), layout (dict), product_map, bundles (list).  
- **Rules (deterministic):**  
  - Always: add “Whole Home” → P_WIFI_MESH_01.  
  - If `usage.security_sensitive`: add Entrance P_SMART_LOCK_01, Living P_CAM_INDOOR_01; if layout_type == "villa" also Perimeter P_CAM_OUTDOOR_01.  
  - If `usage.streaming_heavy`: add Living P_TV_BOX_01.  
- **Bundle:** For each bundle, score = number of recommended product_ids that appear in bundle items. Choose bundle with highest score > 0; set `estimated_monthly` from bundle. If no bundle matches, `estimated_monthly` = sum of unique recommended products’ price_monthly.  
- **Output:** `(list[RecommendationItem], bundle_id | None, estimated_monthly)`.

---

## 5. Advisor LLM (OpenAI)

**File:** `app/services/llm/llm_openai.py`

- **When:** Only if `settings.openai_api_key` is set; else returns None → API returns 503.  
- **Steps:**  
  1. Normalize recos and messages to list of dicts.  
  2. **Context string:** Customer name, layout_type, confidence, room list (name + dims/area), entry_points, layout_status (no layout / medium / clear). If layout has measurement_units, total_area, mentioned_spaces_area, unassigned_space → append “Areas: …”. Then by-room recommendations (product name + why), bundle_id, estimated_monthly (AED).  
  3. **System prompt:** `system_base = get_prompt("advisor_system")` from `prompts/advisor_system.md`. Then append `"\n\n---\nContext (...):\n" + context`.  
  4. **OpenAI:** messages = [system] + conversation (user/assistant only). Model: gpt-4o-mini. `response_format={"type": "json_object"}`.  
  5. **Parse:** Expect JSON `{"reply": "...", "action": "ask"|"offer_plan"}`. Strip markdown code block if present; fallback: find first `{...}` and parse.  
  6. Validate reply non-empty, action in (ask, offer_plan); default action offer_plan.  
  7. Return `(reply, action)` or None on any failure.

---

## 6. Persona

**File:** `app/services/persona/persona_builder.py`

- **Input:** profile dict (must have `customer_id`, `usage`, `segment`).  
- **Output:** Persona (customer_id, persona_label, key_traits, budget_hint, priorities).  
- **Logic:** From `usage`: security_sensitive → trait “security-first”, priority “Home security & access control”; streaming_heavy → “streaming-heavy”, “Stable Wi-Fi & 4K streaming”; work_from_home → “WFH”, “Reliable coverage for meetings”.  
- budget_hint = “Premium” if segment == “Premium” else “Value”.  
- label = “{segment} Smart Living Persona” or “{segment} Secure & Entertainment Family” if both security and streaming.

---

## 7. Frontend flow

- **Entry:** `e-smart-living-advisor/src/main.tsx` → React root, `App.tsx` (QueryClient, TooltipProvider, Toaster, BrowserRouter, Routes: `/` → Index, `*` → NotFound).  
- **Index:** Renders Header, Hero, main with ChatPanel + LayoutSummary + SmartHomePlan. State: plan (AdvisorChatResponse | null), layout (LayoutAnalysis | null), layoutImageUrl.  
- **ChatPanel:**  
  - **Send message:** Append user message to state, call `api.advisorChatStream({ customer_id: DEMO_CUSTOMER_ID, messages, layout_id: layoutId ?? undefined })`.  
  - **Stream:** Push placeholder message with STREAMING_ID; on each `partial_content` append to its content; on `onFinal` replace that message with final answer and stable id, and if action === "offer_plan" call `onPlanGenerated(final)`.  
  - **Fallback:** If stream fails (no onFinal), call non-streaming `api.advisorChat(payload)` and set message from response.  
  - **Upload file:** Show “analyzing” message, `api.analyzeLayout(file)` → `api.upsertLayoutCache(analysis)`, set layoutId, call `onLayoutAnalyzed(analysis, imageUrl)`, append “Uploaded: filename” as user message, then run advisor stream with that conversation and layout_id.  
- **API base URL:** Dev: "" (Vite proxy /api → backend); else VITE_API_URL or http://localhost:8000.  
- **Layout from description:** Not wired in UI; only `api.layoutFromDescription` exists. To use it, add a text path (e.g. “Describe your home”) that calls it, then upsertLayoutCache and set layoutId.

---

## 8. Data and state summary

| What | Where | Volatile? |
|------|--------|-----------|
| Profiles | data/mock_crm_profiles.json | No (file) |
| Product catalog | data/product_catalog.json | No (file) |
| Prompts | backend/prompts/*.md | No (file); cache cleared on startup |
| Layout cache | _LAYOUT_STORE in advisor.py | Yes (in-memory, lost on restart) |
| Demo customer | Frontend DEMO_CUSTOMER_ID = "CUST_1001" | Hardcoded |

---

## 9. Logic checks (consistency)

- **Layout ID consistency:** Upload path uses same layout_id (from analyze response) for upsert and for subsequent chat; description path would use layout_id from from_description response — same pattern.  
- **404 layout_id:** If frontend sends layout_id that was never upserted or server restarted, backend returns 404 (advisor) with message about layout_id not in cache.  
- **503 advisor:** Only when OpenAI key missing or generate_advisor_response returns None (parse/API error). No template fallback.  
- **Streaming:** Full reply is computed first; then stream_text chunks it for SSE. Final event carries the same reply and action so client can correct any chunking display.  
- **Recommendations:** Use layout rooms only indirectly (recommender uses layout_type for villa outdoor camera); room names in recos are fixed (“Whole Home”, “Entrance”, “Living”, “Perimeter”). Layout rooms are passed to LLM for context so the advisor can refer to them.

---

## 10. Prompt files (configurable)

| Name | File | Used by |
|------|------|---------|
| advisor_system | prompts/advisor_system.md | llm_openai (advisor) |
| layout_vision | prompts/layout_vision.md | layout_vision |
| layout_description | prompts/layout_description.md | layout_description |

All loaded via `get_prompt(name)`; layout_vision and layout_description have inline fallbacks if file missing. Cache cleared on app startup.

---

End of step-by-step review. For a shorter flow summary, see `SYSTEM_FLOW.md`.
