from fastapi import APIRouter, WebSocket, Request, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel
import yt_dlp
import asyncio
import os
import shutil
from anyio.to_thread import run_sync
from typing import Dict, List
from app.schemas.requests import VideoRequest, DownloadRequest, ActionRequest, PriorityRequest, ConcurrencyRequest, TaskActionRequest
# Define local schemas for simplicity or if not in schemas.requests
class TaskRequest(BaseModel):
    task_id: str

router = APIRouter()

@router.get("/health")
async def health_check():
    return {"status": "ok", "message": "API Router is active"}

def get_cookies_path(request: Request):
    return getattr(request.app.state, 'cookies_path', None)

def cleanup_download(task_id: str, dl_manager):
    """Background task to delete file after download."""
    import time
    time.sleep(10) # Small buffer
    dl_manager.delete_task(task_id)

# WebSocket endpoint moved to main.py to live at root /ws

@router.post("/info")
async def get_video_info(video_req: VideoRequest, request: Request):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': 'in_playlist',
        'force_ipv4': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'referer': 'https://www.youtube.com/',
    }
    
    # Add cookies if present
    cookies_path = get_cookies_path(request)
    if cookies_path and os.path.exists(cookies_path):
        ydl_opts['cookiefile'] = cookies_path
        print(f"DEBUG: Using cookies from {cookies_path}")

    # Proxy selection and retry logic for info extraction
    proxy_manager = getattr(request.app.state, "proxy_manager", None)
    attempted_proxies = set()
    max_attempts = 5
    if proxy_manager:
        working_count = proxy_manager.get_status().get("valid", 0)
        max_attempts = min(10, working_count + 1)
        
    for attempt in range(max_attempts):
        used_proxy = None
        if proxy_manager:
            used_proxy = proxy_manager.get_random_proxy(exclude=list(attempted_proxies))
            if used_proxy:
                ydl_opts['proxy'] = used_proxy
                print(f"DEBUG: Info attempt {attempt+1} using proxy {used_proxy}")
            else:
                print(f"DEBUG: Info attempt {attempt+1} using direct request.")

        try:
            def extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(video_req.url, download=False)
                    
            info = await run_sync(extract)
            
            if 'entries' in info and len(info['entries']) > 0:
                video_data = info['entries'][0]
                if 'formats' not in video_data:
                    def extract_video_details():
                        inner_opts = {
                            'quiet': True, 
                            'no_warnings': True, 
                            'force_ipv4': True,
                            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                            'referer': 'https://www.youtube.com/',
                        }
                        if used_proxy:
                            inner_opts['proxy'] = used_proxy
                        
                        cookies_path = get_cookies_path(request)
                        if cookies_path and os.path.exists(cookies_path):
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
            error_msg = str(e).lower()
            
            if used_proxy:
                # Aggressive Pruning: remove on any metadata failure
                print(f"WARNING: Proxy {used_proxy} failed during metadata extraction. Pruning and retrying...")
                proxy_manager.mark_failed(used_proxy)
                attempted_proxies.add(used_proxy)
                continue # Try next proxy or direct
            
            # Final failure handling
            cookies_path = get_cookies_path(request)
            has_cookies = cookies_path and os.path.exists(cookies_path)
            
            is_bot = "bot detection" in error_msg
            if is_bot:
                msg = "YouTube is blocking the request (Bot Detection). Please refresh your proxies or upload a fresh cookies.txt using the Settings icon ⚙️."
                if has_cookies:
                    msg = "YouTube is still blocking this server. Your cookies may be EXPIRED, or all proxies are flagged. Try a fresh export and refreshing your proxies ⚙️."
                
                return {
                    "error": "bot_detection", 
                    "message": msg
                }

            if "javascript" in error_msg or "deno" in error_msg:
                return {
                    "error": "missing_runtime",
                    "message": "Missing JavaScript Runtime (Deno/Node). yt-dlp needs this to extract content info on the server."
                }

            return {"error": error_msg}

@router.post("/download")
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

@router.get("/download/{task_id}")
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

@router.post("/save")
async def save_task(task_req: TaskRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager.save_task(task_req.task_id):
        return {"status": "success"}
    raise HTTPException(status_code=400)

@router.post("/remove")
async def remove_task_endpoint(task_req: TaskRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager.delete_task(task_req.task_id):
        return {"status": "success"}
    raise HTTPException(status_code=400, detail="Could not remove task")

@router.post("/pause")
async def pause_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.pause_task(req.task_id)
        return {"status": "paused"}

@router.post("/resume")
async def resume_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resume_task(req.task_id)
        return {"status": "resumed"}

@router.post("/cancel")
async def cancel_download(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.remove_task(req.task_id)
        return {"status": "cancelled"}

@router.post("/proxy/rotate")
async def rotate_proxy(req: ActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        if dl_manager.rotate_task_proxy(req.task_id):
            return {"status": "rotating"}
    return {"status": "error"}

@router.post("/proxy/skip_current")
async def skip_current_proxy(request: Request):
    """Global action to pause all, discard top proxy, and prepare for next."""
    dl_manager = request.app.state.dl_manager
    proxy_manager = request.app.state.proxy_manager
    
    if dl_manager:
        dl_manager.pause_all()
        
    if proxy_manager:
        status = proxy_manager.get_status()
        working = status.get("working_proxies", [])
        if working:
            top_proxy = working[0]
            print(f"DEBUG: Global skip requested. Pruning top proxy: {top_proxy}")
            proxy_manager.mark_failed(top_proxy)
            return {"status": "success", "removed": top_proxy}
            
    return {"status": "success", "message": "No active proxies to skip"}

@router.post("/pause_all")
async def pause_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.pause_all()
        return {"status": "all_paused"}

@router.post("/resume_all")
async def resume_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resume_all()
        return {"status": "all_resumed"}

@router.post("/cancel_all")
async def cancel_all(request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.cancel_all()
        return {"status": "all_cancelled"}

@router.post("/settings/autosave")
async def set_autosave(req: Dict[str, bool], request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        state = req.get('auto_save', False)
        dl_manager.set_auto_save(state)
        return {"status": "success", "auto_save": state}

@router.post("/resubmit")
async def resubmit_download(req: TaskActionRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.resubmit_task(req.task_id)
        return {"status": "resubmitted"}

@router.post("/priority")
async def update_priority(req: PriorityRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.update_priority(req.queue)
        return {"status": "updated"}

@router.post("/settings/concurrency")
async def set_concurrency(con_req: ConcurrencyRequest, request: Request):
    dl_manager = request.app.state.dl_manager
    if dl_manager:
        dl_manager.set_max_concurrent(con_req.limit)
        return {"status": "updated", "limit": dl_manager.max_concurrent}
    return {"status": "error"}

# Cookie path was moved to the top of the file

@router.get("/settings/cookies")
async def get_cookie_status(request: Request):
    cookies_path = get_cookies_path(request)
    return {"exists": cookies_path and os.path.exists(cookies_path)}

@router.get("/settings/cookies/upload")
async def test_upload_route():
    return {"message": "POST to this endpoint to upload cookies.txt"}

@router.post("/settings/cookies/upload")
@router.post("/settings/cookies/upload/")
async def upload_cookies(request: Request, file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Cookie file must be a .txt file")
    
    try:
        content = await file.read()
        text_content = content.decode("utf-8")
        
        # Validation & Auto-fix for common missing header issue
        if "# Netscape HTTP Cookie File" not in text_content:
            if "\t" in text_content:
                # File looks like a cookie file (has tabs) but is missing the required header
                text_content = "# Netscape HTTP Cookie File\n" + text_content
                content = text_content.encode("utf-8")
                print("DEBUG: Auto-added missing Netscape header to cookies.txt")
            else:
                raise HTTPException(status_code=400, detail="Invalid cookie format. Please upload a standard Netscape cookies.txt file.")
        
        cookies_path = get_cookies_path(request)
        if not cookies_path:
             raise HTTPException(status_code=500, detail="Cookie path not configured")

        with open(cookies_path, "wb") as f:
            f.write(content)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/settings/cookies")
async def delete_cookies(request: Request):
    cookies_path = get_cookies_path(request)
    if cookies_path and os.path.exists(cookies_path):
        try:
            os.remove(cookies_path)
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return {"status": "not_found"}

# --- Proxy Management Endpoints ---

@router.get("/settings/proxies")
async def get_proxy_status(request: Request):
    proxy_manager = request.app.state.proxy_manager
    status = proxy_manager.get_status()
    return {
        "status": "verifying" if proxy_manager.is_verifying else "idle",
        "total": status.get("total", 0),
        "processed": status.get("processed", 0),
        "valid": status.get("valid", 0),
        "last_verified": status.get("last_verified")
    }

@router.post("/settings/proxies/upload")
async def upload_proxies(request: Request, file: UploadFile = File(...)):
    if not file.filename.endswith(".txt"):
        raise HTTPException(status_code=400, detail="Proxy file must be a .txt file")
    
    proxy_manager = request.app.state.proxy_manager
    try:
        content = await file.read()
        text_content = content.decode("utf-8")
        
        # 1. Negative Validation: Reject if it looks like a cookie file
        if "# Netscape HTTP Cookie File" in text_content or "\t" in text_content:
            raise HTTPException(status_code=400, detail="This looks like a cookie file, not a proxy list! Please check your file.")

        lines = [l.strip() for l in text_content.splitlines() if l.strip()]
        if not lines:
            raise HTTPException(status_code=400, detail="Proxy file is empty")

        import re
        # Stricter pattern: must be [ptotocol://]host:port
        # host: alphanumeric or - or .
        # port: 1-5 digits
        proxy_pattern = re.compile(r'^(([a-zA-Z0-9.-]+):(\d{1,5}))|([a-z0-9]+://[a-zA-Z0-9.-]+(:\d{1,5})?)')
        
        valid_proxies = [l for l in lines if proxy_pattern.search(l)]
        
        # If less than 50% of the non-empty lines are valid proxies, it's likely the wrong file type
        if len(valid_proxies) < (len(lines) / 2):
             raise HTTPException(status_code=400, detail="Invalid proxy format. Most lines do not match 'host:port' or 'protocol://host:port'.")

        with open(proxy_manager.proxies_file, "wb") as f:
            f.write(content)
        
        # Reset status on new upload
        proxy_manager._status["total"] = len(lines)
        proxy_manager._status["valid"] = 0
        proxy_manager._status["processed"] = 0
        proxy_manager._status["last_verified"] = None
        proxy_manager._status["working_proxies"] = []
        proxy_manager._save_status(force=True)
        
        return {"status": "success", "total": len(lines)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/settings/proxies/scrape")
async def scrape_proxies(request: Request):
    proxy_manager = request.app.state.proxy_manager
    success = await proxy_manager.fetch_free_proxies()
    if success:
        return {"status": "success", "total": proxy_manager.get_status()["total"]}
    raise HTTPException(status_code=500, detail="Failed to scrape proxies")

@router.post("/settings/proxies/verify")
async def verify_proxies_endpoint(request: Request):
    proxy_manager = request.app.state.proxy_manager
    if proxy_manager.is_verifying:
        return {"status": "already_verifying"}
    
    await proxy_manager.verify_proxies()
    return {"status": "started"}

@router.delete("/settings/proxies")
async def delete_proxies(request: Request):
    proxy_manager = request.app.state.proxy_manager
    proxy_manager.delete_proxies()
    return {"status": "success"}

@router.get("/settings/proxies/export")
async def export_proxies(request: Request):
    print("DEBUG: Exporting proxies...")
    proxy_manager = request.app.state.proxy_manager
    status = proxy_manager.get_status()
    working = status.get("working_proxies", [])
    content = "\n".join(working)
    
    # Use a temporary file for the response
    import tempfile
    fd, temp_path = tempfile.mkstemp(suffix=".txt")
    try:
        with os.fdopen(fd, 'w') as tmp:
            tmp.write(content)
    except:
        os.close(fd)
        raise

    def cleanup_temp():
        if os.path.exists(temp_path):
            os.remove(temp_path)
            print(f"DEBUG: Cleaned up temp export file {temp_path}")

    return FileResponse(
        path=temp_path,
        filename="valid_proxies.txt",
        media_type="text/plain",
        background=BackgroundTask(cleanup_temp)
    )
