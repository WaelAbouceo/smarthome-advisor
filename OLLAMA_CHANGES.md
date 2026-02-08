# Ollama Integration Changes

All changes made to integrate Ollama (Llama 4 Scout) as an LLM provider, replacing the OpenAI dependency.

---

## 1. Backend: LLM Provider Selection

**File:** `backend/app/api/v1/advisor.py`

### What changed
- Added dynamic LLM provider selection via `LLM_PROVIDER` environment variable
- Previously hardcoded to `from app.services.llm.llm_openai import generate_advisor_response`
- Now reads `LLM_PROVIDER` env var (default: `"openai"`) and imports from `llm_ollama` or `llm_openai` accordingly
- Added `from app.core.config import settings` import to ensure `.env` file is loaded **before** `LLM_PROVIDER` is read (fixes dotenv load order issue)
- Error messages are now provider-aware: shows Ollama-specific guidance when using Ollama, OpenAI-specific when using OpenAI

### Key code
```python
_LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openai").lower()
if _LLM_PROVIDER == "ollama":
    from app.services.llm.llm_ollama import generate_advisor_response
else:
    from app.services.llm.llm_openai import generate_advisor_response
```

---

## 2. Backend: Ollama LLM Service (New File)

**File:** `backend/app/services/llm/llm_ollama.py`

### What it does
Complete Ollama integration module that mirrors the OpenAI implementation (`llm_openai.py`), providing the same `generate_advisor_response()` function signature.

### OllamaClient class
- Connects to Ollama via Cloudflare tunnel using **session-cookie authentication** (not Bearer token)
- Bootstrap flow: `GET /?token=...` to receive auth cookie, then use cookie for API calls
- Session is created once (singleton) and reused; auto-resets on connection errors
- `chat()` method accepts multi-turn messages (system + user/assistant history)
- Supports `json_mode=True` which sets `"format": "json"` in the Ollama API payload

### generate_advisor_response()
Mirrors the OpenAI implementation exactly:
- **Rich context building** — customer name, layout type, rooms with dimensions/areas, confidence, recommendations by room, bundle, pricing
- **Full conversation history** — passes all chat turns as multi-turn messages (not just the last user message)
- **System prompt** — loads `advisor_system.md` prompt + appends context + JSON format enforcement
- **JSON response parsing** — parses `{reply, action, layout_updates}` with fallback for malformed responses
- **Layout updates** — properly extracts `layout_updates` field for bidirectional chat-layout sync

### Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `"openai"` | Set to `"ollama"` to use this module |
| `OLLAMA_BASE_URL` | `"http://localhost:11434"` | Ollama server URL (or Cloudflare tunnel URL) |
| `OLLAMA_TOKEN` | (none) | Auth token for Cloudflare tunnel |

---

## 3. Backend: Ollama Vision Analysis

**File:** `backend/app/services/layout/layout_vision.py`

### What changed
- Added `_analyze_with_ollama_vision()` function for floor plan image analysis using Llama 4 Scout's vision capabilities
- `analyze_layout_with_vision()` now routes to Ollama or OpenAI based on `LLM_PROVIDER` env var
- Falls back to OpenAI if Ollama vision fails

### Vision function details
- Uses session-cookie auth for Cloudflare tunnel (same bootstrap pattern as chat)
- Calls `/api/generate` endpoint with `images` parameter (base64-encoded)
- `format: "json"` enforces structured JSON output from the model
- `num_predict: 4096` ensures enough tokens for complex blueprints with 15+ rooms
- Parses vision response into `LayoutAnalysis` model with all fields: rooms, dimensions, areas, entry points, notes, measurement units, total area
- Improved logging at WARNING level for failures (previously DEBUG, making issues invisible)

---

## 4. Backend: Environment Configuration

**File:** `backend/.env` (new, gitignored)

### What it does
Stores Ollama configuration so the backend loads it automatically regardless of how it's started (batch file, IDE, direct uvicorn).

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://<tunnel-url>.trycloudflare.com
OLLAMA_TOKEN=<token>
```

The `.env` file is loaded by `backend/app/core/config.py` via python-dotenv at import time.

---

## 5. Backend: Startup Script Update

**File:** `backend/start_with_ollama.bat`

### What changed
- Updated Cloudflare tunnel URL from `cannon-providing-britain-hollow` to `chairs-witch-potato-thousand`

---

## 6. Frontend: Layout Sync Race Condition Fix

**File:** `e-smart-living-advisor/src/components/ChatPanel.tsx`

### The bug
When a user edited room dimensions in the layout panel and then sent a chat message, the chat would show stale data (old dimensions/areas). This happened because:
1. User edits layout in panel → `upsertLayoutCache()` fires
2. User sends chat message → another `upsertLayoutCache()` fires **without `await`** (fire-and-forget)
3. `runStream()` executes immediately, before the cache update completes
4. Backend loads stale layout from cache

### The fix
Changed the `upsertLayoutCache()` call from fire-and-forget to `await`:

```typescript
// Before (race condition):
api.upsertLayoutCache(currentLayout).catch(() => {});

// After (awaited):
try {
  await api.upsertLayoutCache(currentLayout);
} catch {
  // Cache update failed, but continue with message send
}
```

This ensures the backend cache has the latest layout data before the chat request is sent.

---

## 7. Test Script Update

**File:** `test_ollama_connection.py`

### What changed
- Updated Cloudflare tunnel URL to match `start_with_ollama.bat`

---

## How to Use

### Start the backend with Ollama
```bash
# Option A: Use the batch file
start_with_ollama.bat

# Option B: Use .env file (auto-loaded)
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### Switch back to OpenAI
Set `LLM_PROVIDER=openai` in `.env` or remove the variable entirely (defaults to OpenAI). Requires `OPENAI_API_KEY` to be set.

### When Cloudflare tunnel URL changes
Update the URL in:
1. `backend/.env` → `OLLAMA_BASE_URL=https://new-url.trycloudflare.com`
2. `backend/start_with_ollama.bat` → same line
3. Restart the backend
