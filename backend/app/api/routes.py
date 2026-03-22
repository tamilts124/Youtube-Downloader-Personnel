from fastapi import APIRouter, WebSocket, Request, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
import yt_dlp
import asyncio
import os
from anyio.to_thread import run_sync
from typing import Dict, List
from app.schemas.requests import VideoRequest, DownloadRequest, ActionRequest, PriorityRequest, ConcurrencyRequest, TaskActionRequest
# Define local schemas for simplicity or if not in schemas.requests
class TaskRequest(BaseModel):
    task_id: str

router = APIRouter()

def cleanup_download(task_id: str, dl_manager):
    """Background task to delete file after download."""
    import time
    time.sleep(10) # Small buffer
    dl_manager.delete_task(task_id)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        # Accept first!
        await websocket.accept()
        
        state = websocket.app.state
        manager = state.connection_manager
        dl_manager = state.dl_manager
        
        # Add to manager list
        manager.active_connections.append(websocket)
        
        if dl_manager:
             await dl_manager._notify_update_async()
             
        while True:
            # Keep alive and wait for client to close
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except Exception as e:
        print(f"WS Error: {e}")
    finally:
        state = websocket.app.state
        manager = state.connection_manager
        manager.disconnect(websocket)

@router.post("/api/info")
async def get_video_info(video_req: VideoRequest):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
        'force_ipv4': True
    }
    
    # Add cookies if present in backend directory
    cookies_path = os.path.join(os.path.dirname(__file__), "..", "..", "cookies.txt")
    if os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path

    try:
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(video_req.url, download=False)
                
        info = await run_sync(extract)
        
        if 'entries' in info and len(info['entries']) > 0:
            video_data = info['entries'][0]
            if 'formats' not in video_data:
                def extract_video_details():
                    inner_opts = {'quiet': True, 'no_warnings': True, 'force_ipv4': True}
                    if os.path.exists(cookies_path):
                        inner_opts['cookiefile'] = cookies_path
                    with yt_dlp.YoutubeDL(inner_opts) as ydl:
                        return ydl.extract_info(video_data['url'] if 'url' in video_data else video_data['id'], download=False)
                video_data = await run_sync(extract_video_details)
        else:
            video_data = info

        formats = []
        for f in video_data.get('formats', []):
            ext = f.get('ext')
            if ext in ['mp4', 'm4a', 'webm']:
                resolution = f.get('resolution')
                if not resolution or resolution == 'multiple':
                    if f.get('vcodec') == 'none':
                        resolution = 'audio only'
                    else:
                        height = f.get('height')
                        resolution = f"{height}p" if height else "unknown"

                formats.append({
                    'format_id': f['format_id'],
                    'ext': ext,
                    'resolution': resolution,
                    'note': f.get('format_note', f.get('format', '')),
                    'acodec': f.get('acodec', 'none'),
                    'vcodec': f.get('vcodec', 'none'),
                    'filesize_approx': f.get('filesize_approx') or f.get('filesize', 0)
                })
                
        quality_options = [
            {"label": "Best Quality", "value": "best"},
            {"label": "4K (2160p)", "value": "2160"},
            {"label": "2K (1440p)", "value": "1440"},
            {"label": "Full HD (1080p)", "value": "1080"},
            {"label": "HD (720p)", "value": "720"},
            {"label": "SD (480p)", "value": "480"},
            {"label": "360p", "value": "360"},
            {"label": "Audio Only", "value": "audio"}
        ]
                
        return {
            "title": video_data.get('title'),
            "thumbnail": video_data.get('thumbnail') or (video_data.get('thumbnails')[-1].get('url') if video_data.get('thumbnails') else None),
            "duration": video_data.get('duration'),
            "uploader": video_data.get('uploader'),
            "formats": formats,
            "is_playlist": 'entries' in info,
            "playlist_count": len(info['entries']) if 'entries' in info else 0,
            "quality_options": quality_options
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/api/download")
async def start_download(req: DownloadRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        if req.is_playlist:
            dl_manager.add_playlist(req.url, req.quality_target or req.format_id)
            return {"status": "success", "message": "Playlist added to queue"}
        else:
            task = dl_manager.add_task(req.url, req.format_id, req.title, req.thumbnail)
            return {"status": "success", "task_id": task.id}
    return {"status": "error"}

@router.get("/api/download/{task_id}")
async def download_task_file(task_id: str, request: Request, background_tasks: BackgroundTasks):
    dl_manager = request.app.state.dl_manager
    file_path = dl_manager.get_task_file_path(task_id)
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    background_tasks.add_task(cleanup_download, task_id, dl_manager)
    
    return FileResponse(
        path=file_path,
        filename=os.path.basename(file_path),
        media_type='application/octet-stream'
    )

@router.post("/api/save")
async def save_task(task_req: TaskRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager.save_task(task_req.task_id):
        return {"status": "success"}
    raise HTTPException(status_code=400)

@router.post("/api/remove")
async def remove_task_endpoint(task_req: TaskRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager.delete_task(task_req.task_id):
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Could not remove task")

@router.post("/api/pause")
async def pause_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.pause_task(req.task_id)
        return {"status": "paused"}

@router.post("/api/resume")
async def resume_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resume_task(req.task_id)
        return {"status": "resumed"}

@router.post("/api/cancel")
async def cancel_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.remove_task(req.task_id)
        return {"status": "cancelled"}

@router.post("/api/pause_all")
async def pause_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.pause_all()
        return {"status": "all_paused"}

@router.post("/api/resume_all")
async def resume_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resume_all()
        return {"status": "all_resumed"}

@router.post("/api/cancel_all")
async def cancel_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.cancel_all()
        return {"status": "all_cancelled"}

@router.post("/api/settings/autosave")
async def set_autosave(req: Dict[str, bool], request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        state = req.get('auto_save', False)
        dl_manager.set_auto_save(state)
        return {"status": "success", "auto_save": state}

@router.post("/api/resubmit")
async def resubmit_download(req: TaskActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resubmit_task(req.task_id)
        return {"status": "resubmitted"}

@router.post("/api/priority")
async def update_priority(req: PriorityRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.update_priority(req.queue)
        return {"status": "updated"}

@router.post("/api/settings/concurrency")
async def set_concurrency(con_req: ConcurrencyRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.set_max_concurrent(con_req.limit)
        return {"status": "updated", "limit": dl_manager.max_concurrent}
    return {"status": "error"}
