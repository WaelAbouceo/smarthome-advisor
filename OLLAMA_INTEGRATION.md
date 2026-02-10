# Ollama Integration Summary

This project now supports using Ollama (via your Cloudflare URL + token) as an alternative to OpenAI, while keeping the existing FastAPI endpoints unchanged.

## What Was Implemented

1. Added provider-based LLM configuration:
- `LLM_PROVIDER` (`openai` or `ollama`)
- `OPENAI_CHAT_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_VISION_MODEL` (default: `gpt-4o`)
- `OLLAMA_BASE_URL`
- `OLLAMA_TOKEN`
- `OLLAMA_CHAT_MODEL` (default: `llama4:scout`)
- `OLLAMA_VISION_MODEL` (default: `llama4:scout`)

2. Implemented an Ollama compatibility client in:
- `backend/app/services/llm/llm_openai.py`

This client:
- Bootstraps session cookies with `GET {OLLAMA_BASE_URL}/?token=...`
- Calls `POST {OLLAMA_BASE_URL}/api/generate`
- Converts OpenAI-style chat messages into Ollama prompt format
- Extracts base64 data URLs from multimodal image messages and passes them in `images`

3. Wired model selection through config:
- Advisor chat now uses provider-aware model selection (`chat_model_name()`)
- Vision analysis now uses provider-aware model selection (`vision_model_name()`)
- Recommender uses provider-based chat model
- Layout-from-description uses provider-based chat model

4. Added dependency:
- `requests>=2.31.0` in `backend/requirements.txt`

5. Updated error/fallback messages to be provider-neutral (not OpenAI-only wording).

## Files Changed

- `backend/app/core/config.py`
- `backend/app/services/llm/llm_openai.py`
- `backend/app/services/recommendation/llm_recommender.py`
- `backend/app/services/layout/layout_description.py`
- `backend/app/services/layout/layout_vision.py`
- `backend/app/services/layout/layout_analyzer.py`
- `backend/app/api/v1/advisor.py`
- `backend/requirements.txt`

## How To Use Ollama In This Project

Set these in `backend/.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=https://chairs-witch-potato-thousand.trycloudflare.com
OLLAMA_TOKEN=your_token_here
OLLAMA_CHAT_MODEL=llama4:scout
OLLAMA_VISION_MODEL=llama4:scout
```

Then run backend as usual.

## Notes

- You requested using `llama4:scout` for both chat and vision, and it is now the default Ollama model for both.
- Cloudflare tunnel URLs/tokens are temporary; rotate/update env values as needed.
- Keep tokens in `.env` only; do not commit secrets.
