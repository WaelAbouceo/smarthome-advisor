# How to Check Backend Logs for RAG and LLM Recommendations

## Where to See Logs

**Backend logs appear in the terminal where you ran `uvicorn`**, not in log files.

If your backend is running, you should see logs in that terminal window.

---

## Enable DEBUG Logging

To see RAG and LLM recommendation logs, enable DEBUG mode:

### Option 1: Set Environment Variable

```bash
export DEBUG=1
# or
export LOG_LEVEL=DEBUG
```

Then restart backend:
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### Option 2: Run with DEBUG

```bash
cd backend
DEBUG=1 uvicorn app.main:app --reload --port 8000
```

---

## What Logs to Look For

### 1. RAG Retrieval (DEBUG level)
```
DEBUG | rag_retriever | Retrieving relevant knowledge (RAG)
```

### 2. LLM Recommendation Call (DEBUG level)
```
DEBUG | llm_recommender | Calling LLM for recommendations
```

### 3. LLM Recommendations Success (INFO level)
```
INFO | llm_recommender | Using LLM-generated recommendations: count=4 bundle=B_SECURE_HOME monthly=89
```

### 4. Fallback to Rule-Based (INFO level)
```
INFO | llm_recommender | Falling back to rule-based recommendations
```

### 5. LLM Call Details (in llm_calls.jsonl)
Check `backend/logs/llm_calls.jsonl` for detailed LLM request/response logs.

---

## Quick Test to See Logs

1. **Enable DEBUG mode:**
   ```bash
   cd backend
   DEBUG=1 uvicorn app.main:app --reload --port 8000
   ```

2. **In another terminal, run the test:**
   ```bash
   cd /Users/waelabouella/smarthome-advisor
   ./test_backend.sh
   ```

3. **Watch the backend terminal** for:
   - `Retrieving relevant knowledge (RAG)`
   - `Calling LLM for recommendations`
   - `Using LLM-generated recommendations` or `Falling back to rule-based`

---

## Check LLM Call Logs

Detailed LLM calls are logged to:
```
backend/logs/llm_calls.jsonl
```

View recent LLM calls:
```bash
tail -20 backend/logs/llm_calls.jsonl | jq
```

Look for entries with:
- `"service": "recommender"` (if we add that)
- Or check the `input` and `output` fields

---

## Expected Log Flow

When a recommendation request comes in:

1. **RAG Retrieval:**
   ```
   DEBUG | rag_retriever | Retrieving relevant knowledge (RAG)
   ```

2. **LLM Call:**
   ```
   DEBUG | llm_recommender | Calling LLM for recommendations
   ```

3. **Success:**
   ```
   INFO | llm_recommender | Using LLM-generated recommendations: count=4 bundle=B_SECURE_HOME monthly=89
   ```

   OR

   **Fallback:**
   ```
   WARNING | llm_recommender | LLM recommendations failed validation, falling back to rule-based
   INFO | llm_recommender | Falling back to rule-based recommendations
   ```

---

## Troubleshooting

### If you don't see RAG logs:
- Make sure `DEBUG=1` is set
- Check that `logger.debug()` calls are in the code
- Verify backend is running with DEBUG mode

### If you see fallback messages:
- Check if OpenAI API key is configured
- Check if LLM returned valid JSON
- Check validation errors in logs

### To see all logs:
```bash
# Run backend with DEBUG
cd backend
DEBUG=1 LOG_LEVEL=DEBUG uvicorn app.main:app --reload --port 8000
```

---

## Current Log Levels

- **DEBUG**: RAG retrieval, LLM call initiation
- **INFO**: Success messages, fallback messages
- **WARNING**: Validation failures, errors

Make sure DEBUG is enabled to see RAG and LLM call logs!
