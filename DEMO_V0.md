# Smart Living AI buddy - Demo v0

**Status:** ✅ Locked - Stable Demo Version  
**Date:** February 7, 2026

## Overview

This is the first stable demo version of the Smart Living AI buddy system. The system allows users to upload floor plans, get AI-powered room analysis, and receive personalized smart home product recommendations through a conversational interface.

## Key Features

### 1. Floor Plan Upload & Analysis
- **Upload Support:** PDF, JPG, PNG images
- **Vision Analysis:** Uses GPT-4o vision model to analyze floor plans
- **Room Detection:** Automatically identifies rooms, dimensions, and layout type
- **Confidence Scoring:** Each room and overall layout has confidence scores

### 2. Interactive Layout Editor
- **Bidirectional Sync:** Chat and layout panel stay synchronized
- **Editable Rooms:** Users can edit room names, types, dimensions
- **Editable Layout Type:** Users can correct AI classification (Apartment/Villa/Office)
- **Real-time Calculations:** Total area, rooms total, unassigned space update automatically
- **Save & Confirm:** Draft saving and final confirmation workflow

### 3. Conversational Advisor
- **Natural Language:** LLM-powered conversational interface
- **Layout Updates:** LLM handles room additions/updates from natural language
- **Smart Responses:** Acknowledges uploaded images, asks clarifying questions
- **Product Recommendations:** Personalized smart home product suggestions
- **Bundle Suggestions:** Recommends product bundles with pricing

### 4. UI/UX Features
- **Resizable Panels:** Chat and layout panels independently resizable (horizontal & vertical)
- **Streaming Responses:** Real-time streaming of advisor responses
- **Image Display:** Shows uploaded floor plan in layout panel
- **Responsive Design:** Clean, modern UI with Tailwind CSS

## Technical Architecture

### Backend (FastAPI)
- **Framework:** FastAPI with Python 3.11+
- **LLM Integration:** OpenAI GPT-4o (vision) and GPT-4o-mini (advisor)
- **In-Memory Cache:** Layout store for demo purposes
- **API Endpoints:**
  - `POST /api/v1/layout/analyze` - Analyze uploaded floor plan
  - `POST /api/v1/advisor/chat` - Non-streaming chat
  - `POST /api/v1/advisor/chat/stream` - Streaming chat (SSE)
  - `POST /api/v1/advisor/layout_cache/upsert` - Update layout cache
  - `POST /api/v1/layout/draft` - Create layout draft
  - `POST /api/v1/layout/{layout_id}/save` - Save draft
  - `POST /api/v1/layout/{layout_id}/confirm` - Confirm layout

### Frontend (React + Vite)
- **Framework:** React 18 with TypeScript
- **UI Components:** ShadCN UI + Tailwind CSS
- **State Management:** React hooks (useState, useEffect, useRef)
- **Resizable Panels:** react-resizable-panels
- **API Client:** Centralized API client with type definitions

### Key Components
- `ChatPanel.tsx` - Main chat interface
- `LayoutSummary.tsx` - Layout display and editing
- `LayoutUpload.tsx` - File upload component
- `Index.tsx` - Main page orchestrating state

## Data Flow

### Layout Analysis Flow
1. User uploads floor plan → Frontend calls `/layout/analyze`
2. Backend uses GPT-4o vision to analyze image
3. Returns `LayoutAnalysis` with rooms, dimensions, confidence
4. Frontend stores in cache via `/layout_cache/upsert`
5. Layout displayed in panel, chat initialized

### Chat Flow
1. User sends message → Frontend calls `/advisor/chat/stream`
2. Backend loads layout from cache (if `layout_id` provided)
3. Builds persona from CRM profile
4. Gets product recommendations
5. Calls LLM with full context (layout, persona, conversation history)
6. LLM returns response + optional `layout_updates`
7. Backend merges layout updates if present
8. Frontend displays response and updates layout panel

### Bidirectional Sync
- **Chat → Panel:** LLM layout updates automatically sync to panel
- **Panel → Chat:** Panel edits update cache, chat uses updated layout
- **Race Condition Handling:** Parser fallback for immediate UI feedback, LLM authoritative

## LLM Capabilities

### Layout Updates via LLM
The LLM now handles natural language layout updates:
- "missing a garage" → Adds garage room
- "add storage room of 50 ft" → Adds storage with estimated dimensions
- "Kitchen / Dining (300 sq ft)" → Updates existing room area
- "Living Room: 20 × 21 ft" → Updates room dimensions

### Prompt Engineering
- **System Prompt:** `backend/prompts/advisor_system.md`
- **Layout Updates:** LLM returns optional `layout_updates` in JSON response
- **Image Acknowledgment:** Explicit instructions to acknowledge uploaded images
- **Conversational Tone:** Premium advisor persona, never robotic

## Configuration

### Environment Variables
- `OPENAI_API_KEY` - Required for LLM functionality
- Backend runs on `http://localhost:8000`
- Frontend runs on `http://localhost:8082`

### Demo Customer
- Customer ID: `CUST_1001`
- Profile stored in `backend/app/repositories/crm_repo.py`

## Known Limitations (Demo v0)

1. **In-Memory Storage:** Layouts stored in memory, lost on restart
2. **Single Customer:** Demo uses hardcoded customer profile
3. **No Persistence:** No database, all data in-memory
4. **Parser Fallback:** Frontend parser still present but LLM is authoritative
5. **No Authentication:** No user authentication or session management

## File Structure

```
smarthome-advisor/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # API endpoints
│   │   ├── models/          # Pydantic models
│   │   ├── services/
│   │   │   ├── llm/         # LLM integration
│   │   │   ├── layout/      # Layout analysis
│   │   │   └── persona/     # Persona building
│   │   └── core/            # Config, logging
│   ├── prompts/             # LLM prompts
│   └── docs/                # Documentation
├── e-smart-living-advisor/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── lib/             # API client
│   │   └── utils/           # Utilities
│   └── public/
└── DEMO_V0.md              # This file
```

## Key Documentation Files

- `BIDIRECTIONAL_SYNC_FLOW.md` - Data synchronization details
- `backend/docs/LLM_LAYOUT_UPDATES.md` - LLM-driven layout updates
- `backend/docs/SYSTEM_FLOW.md` - End-to-end system flow
- `FRONTEND_IMPROVEMENTS.md` - Frontend refactoring notes

## Testing Checklist

✅ Floor plan upload and analysis  
✅ Room detection and dimension extraction  
✅ Layout panel editing (names, dimensions, types)  
✅ Chat interface with streaming  
✅ Natural language layout updates ("add garage", "missing storage")  
✅ Bidirectional sync between chat and panel  
✅ Product recommendations  
✅ Bundle suggestions with pricing  
✅ Image acknowledgment (no "can't see" messages)  
✅ Resizable panels (horizontal & vertical)  

## Next Steps (Post v0)

- Database persistence for layouts and conversations
- Multi-user support with authentication
- PDF multi-page support
- Room bounding box visualization
- Canvas-based layout editor
- Correction logging for training data
- Enhanced vision analysis with OCR
- Product placement visualization

## Version Info

- **Backend:** FastAPI with Python 3.11+
- **Frontend:** React 18 + TypeScript + Vite
- **LLM:** OpenAI GPT-4o (vision) + GPT-4o-mini (advisor)
- **UI:** ShadCN UI + Tailwind CSS

---

**Demo v0 is locked and ready for demonstration.**
