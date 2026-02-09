# Smart Living AI buddy - Demo v0

AI-powered smart home advisor that analyzes floor plans and provides personalized product recommendations through natural conversation.

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- OpenAI API key

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
export OPENAI_API_KEY=your_key_here
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd e-smart-living-advisor
npm install
npm run dev
```

Visit `http://localhost:8082`

## Features

- **Floor Plan Analysis**: Upload floor plans, get AI-powered room detection
- **Interactive Editor**: Edit rooms, dimensions, layout type with real-time sync
- **Conversational Advisor**: Natural language chat with LLM-powered responses
- **Layout Updates**: LLM handles room additions/updates from chat ("add garage", "missing storage")
- **Product Recommendations**: Personalized smart home product suggestions with bundles

## Supported File Formats

**Floor Plan Upload:**
- **Images**: PNG, JPG/JPEG, WebP
- **Documents**: PDF (first page only)
- **Size Limit**: 20 MB maximum
- **Detection**: Automatic format detection by file extension and content headers

**Notes:**
- PDFs are converted to PNG (first page) using PyMuPDF
- Images are analyzed directly by GPT-4o vision model
- Unsupported formats will prompt user to describe their home in chat

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   FastAPI   │─────▶│   OpenAI    │
│   React     │      │   Backend   │      │   GPT-4o    │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ In-Memory    │
                     │ Layout Store │
                     └──────────────┘
```

**Backend**: FastAPI with OpenAI integration  
**Frontend**: React 18 + TypeScript + Vite  
**LLM**: GPT-4o (vision) + GPT-4o-mini (advisor)

## API Endpoints

- `POST /api/v1/layout/analyze` - Analyze floor plan
- `POST /api/v1/advisor/chat` - Chat (non-streaming)
- `POST /api/v1/advisor/chat/stream` - Chat (SSE streaming)
- `POST /api/v1/advisor/layout_cache/upsert` - Update layout cache

See [backend/README.md](backend/README.md) for full API documentation.

## Documentation

- [Demo v0 Details](DEMO_V0.md) - Complete feature list and technical details
- [Backend Documentation](backend/README.md) - API, logging, error handling
- [Architecture](backend/docs/ARCHITECTURE.md) - System design and data flow

## Environment Variables

**Backend:**
- `OPENAI_API_KEY` - Required for LLM functionality
- `LOG_LEVEL` - DEBUG | INFO | WARNING | ERROR (default: INFO)
- `LOG_JSON` - 1 for JSON logs (default: human-readable)
- `DEBUG` - 1 to force DEBUG logging

**Frontend:**
- `VITE_API_URL` - Backend URL (default: http://localhost:8000)

## Project Structure

```
smarthome-advisor/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/v1/      # API endpoints
│   │   ├── services/    # Business logic
│   │   └── models/      # Pydantic models
│   ├── docs/            # Documentation
│   └── prompts/         # LLM prompts
├── e-smart-living-advisor/  # React frontend
│   └── src/
│       ├── components/  # React components
│       ├── pages/       # Page components
│       └── lib/         # API client
└── README.md            # This file
```

## Development

### Running Tests
```bash
# Backend (if tests exist)
cd backend && pytest

# Frontend
cd e-smart-living-advisor && npm test
```

### Code Quality
- Backend: Python type hints, Pydantic validation
- Frontend: TypeScript strict mode, ESLint

## Production Notes (Demo v0)

**Current Limitations:**
- In-memory storage (data lost on restart)
- Single demo customer
- No authentication
- No database persistence

**For Production:**
- Add database (PostgreSQL recommended)
- Implement authentication/authorization
- Add request rate limiting
- Set up monitoring/alerting
- Configure production logging

## License

Internal use only - Demo v0
