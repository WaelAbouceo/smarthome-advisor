# From PDF (or image) upload to layout

Step-by-step: what happens when the user uploads a PDF or image until a layout is returned.

---

## 1. Frontend: user picks a file

**Files:** `LayoutUpload.tsx`, `ChatPanel.tsx`

- User selects a file (or drops it) in `LayoutUpload`. Accepted types: whatever the `<input type="file">` allows (typically images and PDFs).
- `handleFile(file)` calls `onUpload(file)` → in ChatPanel that is `handleUpload(file)`.

---

## 2. Frontend: call analyze API

**File:** `ChatPanel.tsx` → `api.analyzeLayout(file)`

- Builds `FormData`, appends the file under key `"file"`.
- `POST /api/v1/layout/analyze` (relative URL; Vite proxies `/api` to backend).

**File:** `lib/api.ts`

```ts
const form = new FormData();
form.append("file", file);
const r = await apiFetch("/api/v1/layout/analyze", { method: "POST", body: form });
return r.json();  // → LayoutAnalysis
```

---

## 3. Backend: layout API receives the file

**File:** `app/api/v1/layout.py`

- **Route:** `POST /api/v1/layout/analyze`, parameter `file: UploadFile = File(...)`.
- Checks: `file.filename` present, `content = await file.read()` non-empty. Otherwise 400.
- Calls **`analyze_layout_bytes(file.filename, content)`** with the raw bytes.
- Returns **`analysis.model_dump()`** (layout as JSON).

---

## 4. Analyzer: vision or fallback

**File:** `app/services/layout/layout_analyzer.py`

- **`analyze_layout_bytes(filename, content)`**:
  1. Tries **`analyze_layout_with_vision(filename, content)`** from `layout_vision`.
  2. If it returns a **LayoutAnalysis** → return it.
  3. If it returns **None** or **raises** (no API key, bad file, parse error, etc.) → return a **fallback layout**:
     - `layout_id = "layout_" + sha1(content)[:10]`
     - `layout_type="unknown"`, `rooms=[]`, `confidence=0.0`
     - Notes: "We couldn't analyze this image automatically... Describe your home in the chat below..."

So the only path that produces a “real” layout from the file is **layout_vision**. PDF vs image is handled inside vision.

---

## 5. Vision: PDF vs image

**File:** `app/services/layout/layout_vision.py` → **`analyze_layout_with_vision(filename, content)`**

**A. OpenAI client**

- If no `OPENAI_API_KEY` → return **None** (analyzer will use fallback).

**B. Media type**

- **`_infer_media_type(filename, content)`**: uses extension and magic bytes.
  - `.pdf` or bytes start with `%PDF` → **application/pdf**
  - `.png` / PNG signature → image/png
  - `.jpg`/`.jpeg` / JPEG signature → image/jpeg
  - `.webp` → image/webp
  - default → image/png

**C. PDF → image (only for PDF)**

- If **media_type == "application/pdf"**:
  1. **`_pdf_to_image_bytes(content)`**:
     - Uses **PyMuPDF (fitz)**.
     - `fitz.open(stream=content, filetype="pdf")`.
     - **First page only:** `doc.load_page(0)`.
     - Renders at **150 DPI**, no alpha → **PNG bytes**.
     - Closes doc, returns PNG bytes.
  2. If that returns **None** (not PDF, corrupt, or fitz missing/error) → **return None** (analyzer fallback).
  3. Otherwise set **image_bytes** = that PNG, **media_type** = `"image/png"`.
- If not PDF: **image_bytes = content** (unchanged).

**D. Size check**

- If no image_bytes or size **> 20 MB** → return **None**.

**E. Image for the API**

- **`_image_bytes_to_base64_url(image_bytes, media_type)`** → `data:image/png;base64,...` (or jpeg/webp).

**F. Vision LLM call**

- Prompt from **`get_prompt("layout_vision")`** or inline fallback.
- **OpenAI** `client.chat.completions.create`:
  - **model:** `gpt-4o`
  - **messages:** one user message with:
    - `{"type": "text", "text": prompt}`
    - `{"type": "image_url", "image_url": {"url": image_url}}`
- So for a **PDF**, the model actually sees the **first page rendered as PNG** (same as for an uploaded image).

**G. Parse response**

- `raw = resp.choices[0].message.content`.
- Log to **llm_calls.jsonl** (agent `layout_vision`).
- Strip markdown code fence if present, then **json.loads(raw)**.
- Normalize: **layout_type**, **rooms** (room, room_type, width, length, height, area, size_confidence), **entry_points**, **notes**, **layout_confidence**, **measurement_units**, **total_area**, **mentioned_spaces_area**, **unassigned_space**.
- **layout_id** = `"layout_" + sha1(**original** content)[:10]` — so for a PDF, layout_id is from the **PDF bytes**, not the PNG.

**H. Return**

- **LayoutAnalysis**(layout_id, layout_type, rooms, entry_points, notes, confidence, source_filename, + optional area fields).
- On **JSONDecodeError** or other exception → return **None** → analyzer uses fallback.

---

## 6. Back to frontend: layout in hand

- Response of **POST /api/v1/layout/analyze** is the layout JSON (from vision or fallback).
- **ChatPanel** then:
  1. **`api.upsertLayoutCache(analysis)`** → `POST /api/v1/advisor/layout_cache/upsert` so the backend stores the layout by **layout_id**.
  2. **`setLayoutId(analysis.layout_id)`** for later advisor requests.
  3. **`onLayoutAnalyzed(analysis, imageUrl)`** so the page can show **LayoutSummary** (and optional preview image; for PDF, frontend may not show preview if it doesn’t treat PDF as image).
  4. Appends a user message “Uploaded: {filename}” and runs the **advisor stream** with that message and **layout_id**.

---

## 7. Summary (PDF upload path)

| Step | Where | What happens |
|------|--------|----------------|
| 1 | Frontend | User selects PDF → `handleUpload(file)` |
| 2 | Frontend | `POST /api/v1/layout/analyze` with file in FormData |
| 3 | layout.py | Read file bytes → `analyze_layout_bytes(filename, content)` |
| 4 | layout_analyzer | Call `analyze_layout_with_vision()`; on None/exception → return fallback layout |
| 5a | layout_vision | Infer type: PDF → `_pdf_to_image_bytes(content)` → first page as PNG @ 150 DPI |
| 5b | layout_vision | Build data URL of image (PNG), call gpt-4o with prompt + image |
| 5c | layout_vision | Parse JSON from response → LayoutAnalysis; layout_id = sha1(**original PDF bytes**)[:10] |
| 6 | layout.py | Return `analysis.model_dump()` |
| 7 | Frontend | upsertLayoutCache, setLayoutId, onLayoutAnalyzed, then advisor stream with layout_id |

So: **from PDF upload to layout** = file → API → analyzer → vision (PDF → first-page PNG → vision LLM → JSON → LayoutAnalysis) or fallback → same layout JSON back to client and into cache.
