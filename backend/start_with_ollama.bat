@echo off
REM Set environment variables for Ollama Scout integration
set LLM_PROVIDER=ollama
set OLLAMA_BASE_URL=https://chairs-witch-potato-thousand.trycloudflare.com
set OLLAMA_TOKEN=a34ec7e79a52319d3ba5223cd0d6e2e8ff959bb14645dea6bc000d7f92ad22cb

echo ========================================
echo  Ollama Scout Backend Startup
echo ========================================
echo.
echo Environment Variables:
echo   LLM_PROVIDER: %LLM_PROVIDER%
echo   OLLAMA_BASE_URL: %OLLAMA_BASE_URL%
echo   OLLAMA_TOKEN: %OLLAMA_TOKEN:~0,20%...
echo.
echo Starting backend...
echo.

cd /d c:\Users\Administrator\Downloads\smarthome-advisor\backend
python -m uvicorn app.main:app --reload --port 8000

pause
