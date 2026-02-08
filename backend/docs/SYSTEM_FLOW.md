# Smart Living Advisor — Step-by-Step System Flow

This document describes the full logic from user action to advisor response so we can debug and fix behavior.

---

## 1. Frontend: User sends a message

**File:** `e-smart-living-advisor/src/components/ChatPanel.tsx`

- User types in the input and hits Send, or uploads a file.
- **On Send:** `handleSend()` builds `nextMessages = toChatMessages(messages) + new user message`, then calls `runStream({ customer_id: DEMO_CUSTOMER_ID, messages: nextMessages, layout_id: layoutId ?? undefined })`.
- **On Upload:** `handleUpload()` calls `api.analyzeLayout(file)`, then `api.upsertLayoutCache(analysis)`, sets `layoutId`, then runs advisor with conversation including "Uploaded: {filename}" and `layout_id: analysis.layout_id`.
- **Important:** Full conversation history (including initial greeting and all turns) is sent every time. `layout_id` is sent only if the user has already uploaded a layout (and the backend stored it in `_LAYOUT_STORE`).

---

## 2. Backend: Advisor chat endpoint

**File:** `app/api/v1/advisor.py`

**Steps:**

1. **Load profile**  
   `profile = crm.get_profile(req.customer_id)`. If missing → 404.

2. **Build persona**  
   `persona_obj = build_persona(profile)` from `app/services/persona/persona_builder.py` (traits, priorities, budget from CRM usage/segment).

3. **Load layout**  
   `layout = {}` by default. If `req.layout_id` is set, `layout = _LAYOUT_STORE.get(req.layout_id, {})`. If layout_id is set but not in store → 404.  
   **So:** No upload yet → `layout_id` is null → `layout` stays `{}`. After upload + upsert, `layout_id` is set and `layout` is the analyzed (or unanalyzed) layout dict.

4. **Recommendations**  
   `recos, bundle_id, est_monthly = recommend(profile, layout, product_map, bundles)`. Uses profile usage + layout rooms to suggest products and a bundle.

5. **Call advisor LLM**  
   `reply, action = generate_advisor_response(...)` from `app/services/llm/llm_openai.py`. LLM-only; no template fallback. If OpenAI unavailable → returns None → API returns 503.

6. **Return**  
   `AdvisorChatResponse(answer=reply, ..., action=action)`.

---

## 3. LLM layer: LLM only (no fallback)

**File:** `app/api/v1/advisor.py` calls `app/services/llm/llm_openai.generate_advisor_response` directly.

- **No template fallback.** All advisor replies come from the LLM (OpenAI). If the LLM is unavailable (no `OPENAI_API_KEY` or API error), `generate_advisor_response` returns `None` and the API returns **503** with detail: *"Advisor is temporarily unavailable. Please ensure OPENAI_API_KEY is configured."*
- **Streaming:** `llm_stub.stream_text` is used only to chunk the LLM reply for SSE; it does not generate content.

---

## 4. Real LLM (OpenAI)

**File:** `app/services/llm/llm_openai.py`

**When used:** Only when `OPENAI_API_KEY` is set and the client can be created. Otherwise returns `None` and stub is used.

**Steps:**

1. **Normalize**  
   `recos` and `messages` normalized to list of dicts.

2. **Build context string**  
   From persona (name), layout (type, confidence, rooms, entry_points), layout_status (no layout / medium / clear), and by-room recommendations (product names + why). Appends bundle_id and estimated_monthly if present.

3. **System prompt**  
   `system_base = get_prompt("advisor_system")` from `backend/prompts/advisor_system.md`. Then `system_prompt = system_base + "\n\n---\nContext (...):\n" + context`.

4. **OpenAI API**  
   `messages = [system message] + conversation turns (user/assistant only)`. Model: gpt-4o-mini. Response must be JSON `{"reply": "...", "action": "ask"|"offer_plan"}`.

5. **Parse and return**  
   Extract `reply` and `action`; if parsing fails or empty reply → return `None` (stub will run).

---

## 5. Layout flow (upload or description)

**Upload:**

1. **Frontend:** `api.analyzeLayout(file)` → `POST /api/v1/layout/analyze` with multipart file.
2. **Backend:** `app/api/v1/layout.py` → `analyze_layout_bytes(filename, content)` (`app/services/layout/layout_analyzer.py`).
3. **Analyzer:** Tries vision LLM (`layout_vision.analyze_layout_with_vision`). On success → returns layout with rooms, type, confidence. On failure or no key → returns "unanalyzed" layout: `layout_type="unknown"`, `rooms=[]`, `confidence=0.0`, notes saying we couldn’t analyze.
4. **Frontend:** Receives layout, calls `api.upsertLayoutCache(analysis)` → `POST /api/v1/advisor/layout_cache/upsert` with the layout (including `layout_id`). Backend stores it in `_LAYOUT_STORE[layout_id]`.
5. **Next chat:** Frontend sends `layout_id` in advisor request; backend loads `layout = _LAYOUT_STORE[layout_id]`.

**From description:**

1. **Frontend:** `api.layoutFromDescription(description)` → `POST /api/v1/layout/from_description` with `{ description }`.
2. **Backend:** `extract_layout_from_description(description)` (layout_description LLM). Returns layout dict. Frontend should then call `upsertLayoutCache` and use returned `layout_id` in chat.

---

## 6. Data flow summary

| Step | No layout (first message) | After upload (with layout_id) |
|------|---------------------------|--------------------------------|
| Frontend | `layout_id: undefined` | `layout_id: analysis.layout_id` |
| Advisor API | `layout = {}` | `layout = _LAYOUT_STORE[layout_id]` |
| Recommender | Uses empty rooms | Uses layout rooms + profile |
| LLM / Stub | No layout → stub: "tell me about your space" (or OpenAI: follows prompt) | Layout → confirm or offer_plan |

---

## 7. Design: LLM end-to-end

- **No fallback.** Advisor is LLM-only; unavailable → 503. **Prompt:** Rule 0 in `advisor_system.md`: answer "who are you?" directly; don’t ask for space. Context block in `llm_openai.py` also says: if user is asking about you, answer directly.
- Layout/space flow and meta-questions (who are you) are handled by the prompt; no template fallback.
