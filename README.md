# YouTube Downloader (Nexus)

A high-performance YouTube video and playlist downloader built with FastAPI (Python) and React (Vite).

## Features
- **FastAPI Backend**: Uses `yt-dlp` for reliable video and format extraction.
- **React Frontend**: Built with Vite and Tailwind CSS for a premium, responsive experience.
- **WebSocket Synchronization**: Real-time progress updates for every download task.
- **Queue Management**: Drag-and-drop to prioritize downloads, pause/resume, and bulk actions.
- **Auto-Save**: Automatically move completed downloads to your system's `Downloads` folder.

## Architecture
This project follows a professional modular architecture:

### Backend (`/backend`)
- `app/api`: FastAPI route handlers.
- `app/core`: Core services including `DownloadManager`.
- `app/schemas`: Pydantic models for type-safe requests.
- `main.py`: Entry point wrapper.

### Frontend (`/frontend`)
- `src/components`: Decoupled UI components (Header, Queue, Settings, etc.).
- `src/services`: API and WebSocket management.
- `src/types`: Centralized TypeScript definitions.

## Getting Started

### Prerequisites
- Python 3.8+
- Node.js 16+

### Backend Setup
1. Navigate to `backend/`.
2. Install dependencies: `pip install -r requirements.txt`.
3. Run the server: `python main.py`.

### Frontend Setup
1. Navigate to `frontend/`.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev`.

## License
MIT
