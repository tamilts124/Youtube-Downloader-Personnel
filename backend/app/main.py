from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncio
import os
import uvicorn

from app.core.manager import DownloadManager
from app.api.routes import router
from app.services.proxy_manager import ProxyManager

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        connections = list(self.active_connections)
        for connection in connections:
            try:
                # Add timeout to broadcast to avoid hanging if client is stuck
                await asyncio.wait_for(connection.send_json(message), timeout=2.0)
            except Exception:
                try:
                    self.disconnect(connection)
                except:
                    pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize data directory (at root, outside backend to avoid uvicorn reloads)
    # Initialize data directory (inside backend, but excluded from uvicorn reload)
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(root_dir, "data")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

    cookies_path = os.path.join(data_dir, "cookies.txt")
    app.state.cookies_path = cookies_path

    # Initialize managers and store in app state
    connection_manager = ConnectionManager()
    dl_manager = DownloadManager(connection_manager.broadcast, max_concurrent=2, data_dir=data_dir)
    dl_manager.set_loop(asyncio.get_running_loop())
    
    app.state.connection_manager = connection_manager
    app.state.dl_manager = dl_manager
    
    # Initialize Proxy Manager
    proxy_manager = ProxyManager(data_dir)
    app.state.proxy_manager = proxy_manager
    
    # Link proxy manager to download manager
    dl_manager.set_proxy_manager(proxy_manager)

    yield

app = FastAPI(title="YouTube Downloader API", lifespan=lifespan)

# CORS: Keep for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional: Disable same-origin check for WebSockets if needed
# (FastAPI/Starlette handles this via CORSMiddleware usually, but we'll be safe)

# API Routes
app.include_router(router, prefix="/api")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # This matches the frontend expectation at root /ws
    try:
        origin = websocket.headers.get("origin")
        host = websocket.headers.get("host")
        print(f"DEBUG WS: Handshake Attempt - Origin: {origin}, Host: {host}")
        
        await websocket.accept()
        manager = websocket.app.state.connection_manager
        dl_manager = websocket.app.state.dl_manager
        manager.active_connections.append(websocket)
        
        # Initial sync: push current state immediately
        if dl_manager:
            await dl_manager._notify_update_async()
        
        print(f"DEBUG WS: Client connected from {origin}")
        
        while True:
            # Keep alive and handle anything from client (ping/pong)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                
    except Exception as e:
        print(f"DEBUG WS: Socket Error: {e}")
    finally:
        try:
            manager = websocket.app.state.connection_manager
            manager.active_connections.remove(websocket)
        except:
            pass
        print("DEBUG WS: Client disconnected")

@app.get("/ping")
async def ping():
    return {"status": "online", "message": "Backend is active"}

# Static Files serving (Frontend)
# We assume frontend/dist is sibling to backend/ in the final container
FRONTEND_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))

if os.path.exists(FRONTEND_PATH):
    print(f"Serving static files from: {FRONTEND_PATH}")
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_PATH, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Serve the file if it exists, otherwise serve index.html
        file_path = os.path.join(FRONTEND_PATH, full_path)
        if full_path != "" and os.path.exists(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_PATH, "index.html"))
else:
    print(f"Warning: Frontend path not found at {FRONTEND_PATH}")
    @app.get("/")
    async def root():
        return {"message": "Backend is online. Frontend not found.", "path_tried": FRONTEND_PATH}

if __name__ == "__main__":
    import uvicorn
    # Use port from env (default 8000 for local, 7860 for HF)
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
