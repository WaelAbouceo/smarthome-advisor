# Frontend - Smart Living AI buddy

React frontend for Smart Living AI buddy - Demo v0

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Visit http://localhost:8082
```

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **ShadCN UI** - Component library
- **Tailwind CSS** - Styling
- **react-resizable-panels** - Resizable UI panels

## Project Structure

```
src/
├── components/      # React components
│   ├── ChatPanel.tsx
│   ├── LayoutSummary.tsx
│   └── ui/         # ShadCN UI components
├── pages/          # Page components
│   ├── Index.tsx
│   └── LayoutEditorPage.tsx
├── lib/            # API client and utilities
│   └── api.ts      # API client with types
└── utils/          # Utilities
    ├── constants.ts
    └── roomParsing.ts
```

## Key Components

- **ChatPanel**: Conversational interface with streaming
- **LayoutSummary**: Layout display and editing
- **LayoutUpload**: File upload component
- **Index**: Main page orchestrating state

## API Integration

API client in `src/lib/api.ts`:
- Type-safe API calls
- Streaming support (SSE)
- Error handling

## Environment Variables

- `VITE_API_URL` - Backend URL (default: http://localhost:8000)

## Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm test
```

## Features

- Floor plan upload and display
- Interactive layout editor
- Real-time chat with streaming
- Bidirectional sync (chat ↔ layout panel)
- Resizable panels (horizontal & vertical)

See main [README.md](../README.md) for full project documentation.
