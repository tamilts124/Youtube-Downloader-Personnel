import asyncio
import threading
import uuid
import yt_dlp
import os
import shutil
import zipfile
import sqlite3
from datetime import datetime
from typing import Dict, Any, List

class DownloadTask:
    def __init__(self, url: str, format_id: str, title: str, thumbnail: str, save_path: str, quality_target: str = None):
        self.id = str(uuid.uuid4())
        self.url = url
        self.format_id = format_id
        self.quality_target = quality_target
        self.title = title
        self.thumbnail = thumbnail
        self.save_path = save_path
        self.status = "queued" # queued, downloading, paused, completed, error, cancelled
        self.progress = 0.0
        self.speed = "0 B/s"
        self.eta = "N/A"
        self.error_msg = ""
        self._stop_event = threading.Event()
        self.speed_history = [] # To average jittery speeds
        self.last_broadcast_time = 0 # To throttle updates
        self.created_at = datetime.now().isoformat()

    @classmethod
    def from_db_row(cls, row):
        task = cls(row['url'], row['format_id'], row['title'], row['thumbnail'], row['save_path'], row['quality_target'])
        task.id = row['id']
        task.status = row['status']
        task.progress = row['progress']
        task.error_msg = row['error_msg']
        task.created_at = row['created_at']
        return task


class DownloadManager:
    def __init__(self, broadcast_callback, max_concurrent=2, data_dir=None):
        self.tasks: Dict[str, DownloadTask] = {}
        self.queue: List[str] = [] # List of task IDs in queue order
        self.max_concurrent = max_concurrent
        self.broadcast = broadcast_callback
        try:
            self.loop = asyncio.get_running_loop()
        except RuntimeError:
            self.loop = None
        
        self.proxy_manager = None
        
        # Centralized Path Management
        if data_dir:
            self.data_dir = data_dir
            self.db_path = os.path.join(data_dir, "downloads.db")
            self.cookies_path = os.path.join(data_dir, "cookies.txt")
            # Place temp parallel to data inside backend/
            self.temp_save_path = os.path.join(os.path.dirname(data_dir), "temp")
        else:
            # Fallback legacy paths
            self.data_dir = os.path.dirname(os.path.abspath(__file__))
            self.db_path = os.path.join(self.data_dir, "downloads.db")
            self.cookies_path = os.path.join(self.data_dir, "cookies.txt")
            self.temp_save_path = os.path.join(self.data_dir, "temp")
            
        if not os.path.exists(self.temp_save_path):
            os.makedirs(self.temp_save_path)

        self.lock = threading.RLock()
        self.auto_save = False
        self._init_db()
        self._load_tasks_from_db()

    def set_loop(self, loop):
        self.loop = loop

    def set_proxy_manager(self, proxy_manager):
        self.proxy_manager = proxy_manager

    def _get_db_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_db_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    url TEXT,
                    format_id TEXT,
                    title TEXT,
                    thumbnail TEXT,
                    save_path TEXT,
                    status TEXT,
                    progress REAL,
                    error_msg TEXT,
                    quality_target TEXT,
                    created_at TEXT
                )
            """)
            conn.commit()

    def _load_tasks_from_db(self):
        with self._get_db_conn() as conn:
            rows = conn.execute("SELECT * FROM tasks ORDER BY created_at ASC").fetchall()
            for row in rows:
                task = DownloadTask.from_db_row(row)
                # Force all non-finished tasks to paused on startup for user control
                if task.status in ["downloading", "queued"]:
                    task.status = "paused"
                
                # Force new path to avoid re-creating root folders from legacy DB entries
                task.save_path = self.temp_save_path
                
                self.tasks[task.id] = task
                self.queue.append(task.id)
        print(f"DEBUG: Loaded {len(self.tasks)} tasks from SQLite")

    def _save_task_to_db(self, task: DownloadTask):
        with self._get_db_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO tasks (
                    id, url, format_id, title, thumbnail, save_path, 
                    status, progress, error_msg, quality_target, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task.id, task.url, task.format_id, task.title, task.thumbnail, task.save_path,
                task.status, task.progress, task.error_msg, task.quality_target, task.created_at
            ))
            conn.commit()

    def add_task(self, url: str, format_id: str, title: str, thumbnail: str, quality_target: str = None) -> DownloadTask:
        task = DownloadTask(url, format_id, title, thumbnail, self.temp_save_path, quality_target)
        with self.lock:
            self.tasks[task.id] = task
            self.queue.append(task.id)
            self._save_task_to_db(task)
        self._notify_update()
        self._trigger_process()
        return task

    def add_playlist(self, url: str, quality_or_format: str):
        thread = threading.Thread(target=self._playlist_worker, args=(url, quality_or_format))
        thread.daemon = True
        thread.start()

    def _playlist_worker(self, url: str, quality_or_format: str):
        print(f"DEBUG: _playlist_worker started for {url}", flush=True)
        
        # Force playlist URL if list ID is present to ensure flat extraction finds entries
        if 'list=' in url:
             import urllib.parse
             try:
                  parsed = urllib.parse.urlparse(url)
                  params = urllib.parse.parse_qs(parsed.query)
                  if 'list' in params:
                       url = f"https://www.youtube.com/playlist?list={params['list'][0]}"
                       print(f"DEBUG: Refined playlist URL to {url}", flush=True)
             except Exception as e:
                  print(f"DEBUG: URL refining failed: {e}", flush=True)

        if self.loop:
            asyncio.run_coroutine_threadsafe(self.broadcast({
                "type": "notification",
                "level": "info",
                "message": "Expanding playlist... please wait."
            }), self.loop)

        quality_target = None
        format_id = quality_or_format
        
        if quality_or_format in ['best', '2160', '1440', '1080', '720', '480', '360', 'audio']:
            quality_target = quality_or_format
            format_id = "best"

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'force_ipv4': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'referer': 'https://www.youtube.com/',
        }
        
        # Add cookies if present
        if os.path.exists(self.cookies_path):
            ydl_opts['cookiefile'] = self.cookies_path
            print(f"DEBUG: Playlist worker using cookies from: {self.cookies_path}")

        # Add proxy if available
        if self.proxy_manager:
            status = self.proxy_manager.get_status()
            if status.get("working_proxies"):
                ydl_opts['proxy'] = status["working_proxies"][0]
                print(f"DEBUG: Playlist worker using proxy: {ydl_opts['proxy']}")
        try:
            print(f"Expanding playlist: {url}")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info and 'entries' in info:
                    entries = list(info['entries'])
                    count = len(entries)
                    if self.loop:
                        asyncio.run_coroutine_threadsafe(self.broadcast({
                            "type": "notification",
                            "level": "success",
                            "message": f"Found {count} items in playlist!"
                        }), self.loop)

                    for entry in entries:
                         if not entry: continue
                         title = entry.get('title') or entry.get('id') or 'Untitled Item'
                         vid_id = entry.get('url') or entry.get('id')
                         if not vid_id: continue
                         
                         video_url = vid_id
                         if not video_url.startswith('http'):
                              video_url = f"https://www.youtube.com/watch?v={video_url}"
                         
                         thumb = entry.get('thumbnail')
                         if not thumb and entry.get('thumbnails'):
                              thumb = entry.get('thumbnails')[-1].get('url')
                         if not thumb: thumb = ""
                         
                         self.add_task(video_url, format_id, title, thumb, quality_target)

                else:
                    raise Exception("No content found in this playlist.")

        except Exception as e:
            print(f"Playlist expansion error for {url}: {e}")
            if self.loop:
                asyncio.run_coroutine_threadsafe(self.broadcast({
                    "type": "notification",
                    "level": "error",
                    "message": f"Playlist error: {str(e)}"
                }), self.loop)

    def remove_task(self, task_id: str):
        """Helper to call delete_task for unified removal."""
        print(f"!!! MANAGER: Calling delete_task for {task_id}")
        return self.delete_task(task_id)

    def pause_task(self, task_id: str):
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                if task.status in ["downloading", "queued"]:
                    task.status = "paused"
                    task._stop_event.set()
                    self._save_task_to_db(task)
        self._notify_update()
        self._trigger_process()

    def pause_all(self):
        with self.lock:
            for tid in self.queue:
                task = self.tasks.get(tid)
                if task and task.status in ["downloading", "queued"]:
                    task.status = "paused"
                    task._stop_event.set()
                    self._save_task_to_db(task)
        self._notify_update()
        self._trigger_process()


    def set_auto_save(self, state: bool):
        self.auto_save = state
        print(f"Auto-save is now: {self.auto_save}")

    def resume_task(self, task_id: str):
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                if task.status in ["paused", "error"]:
                    task.status = "queued"
                    task._stop_event.clear()
                    self._save_task_to_db(task)
                    print(f"Resuming task {task_id}")
                else:
                    print(f"Cannot resume task {task_id} in status {task.status}")
            else:
                print(f"Error: task {task_id} not found for resume")
        self._notify_update()
        self._trigger_process()

    def resubmit_task(self, task_id: str):
        with self.lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                # Reset to queued and clear stop event
                task.status = "queued"
                task.progress = 0
                task.error_msg = ""
                task._stop_event.clear()
                self._save_task_to_db(task)
                print(f"Resubmitting task {task_id}")
        self._notify_update()
        self._trigger_process()

    def update_priority(self, ordered_ids: List[str]):
        with self.lock:
            new_queue = []
            for tid in ordered_ids:
                if tid in self.queue:
                    new_queue.append(tid)
            # Add any tasks not in the ordered list (to be safe)
            for tid in self.queue:
                if tid not in new_queue:
                    new_queue.append(tid)
            self.queue = new_queue
        self._notify_update()
        self._trigger_process()

    def resume_all(self):
        with self.lock:
            for tid in self.queue:
                task = self.tasks.get(tid)
                if task and (task.status == "paused" or task.status == "error"):
                    task.status = "queued"
                    task._stop_event.clear()
                    self._save_task_to_db(task)
        self._notify_update()
        self._trigger_process()

    def set_max_concurrent(self, limit: int):
        if limit > 0:
            with self.lock:
                self.max_concurrent = limit
            print(f"Concurrency limit set to: {self.max_concurrent}")
            self._trigger_process()

    def _trigger_process(self):
        if self.loop:
            self.loop.call_soon_threadsafe(self._process_queue)
        else:
            self._process_queue()

    def _process_queue(self):
        with self.lock:
            active_count = len([t for t in self.tasks.values() if t.status == "downloading"])
            
            if active_count < self.max_concurrent:
                for tid in self.queue:
                    if active_count >= self.max_concurrent:
                        break
                    
                    task = self.tasks.get(tid)
                    if task and task.status == "queued":
                        task.status = "downloading"
                        task._stop_event.clear()
                        task.error_msg = ""
                        
                        thread = threading.Thread(target=self._download_worker, args=(task,))
                        thread.daemon = True
                        thread.start()
                        active_count += 1
                self._notify_update()

    def _download_worker(self, task: DownloadTask):
        class MyLogger:
            def debug(self, msg): pass
            def warning(self, msg): pass
            def error(self, msg): print(msg)

        def progress_hook(d):
            if task._stop_event.is_set():
                raise Exception("Download stopped by user")

            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate')
                downloaded = d.get('downloaded_bytes', 0)
                current_speed = d.get('speed') # bytes/second
                
                if total:
                    task.progress = (downloaded / total) * 100
                    
                    # Smoothing logic
                    avg_speed = 0
                    if current_speed is not None:
                        task.speed_history.append(current_speed)
                        if len(task.speed_history) > 10:
                            task.speed_history.pop(0)
                        
                        avg_speed = sum(task.speed_history) / len(task.speed_history)
                        task.speed = self._format_speed(avg_speed)
                    else:
                        task.speed = "N/A"
                    
                    # ETA smoothing using averaged speed
                    bytes_left = total - downloaded
                    if avg_speed > 0:
                        eta_seconds = bytes_left / avg_speed
                        task.eta = self._format_eta(eta_seconds)
                    else:
                        task.eta = "N/A"
                    
                    # Throttling logic: only broadcast every 1 second
                    import time
                    now = time.time()
                    if self.loop and (now - task.last_broadcast_time >= 1.0 or task.progress >= 100):
                        task.last_broadcast_time = now
                        asyncio.run_coroutine_threadsafe(self.broadcast({
                            "type": "progress",
                            "task_id": task.id,
                            "progress": task.progress,
                            "speed": task.speed,
                            "eta": task.eta
                        }), self.loop)
                    
            elif d['status'] == 'finished':
                task.progress = 100
                if self.loop:
                    asyncio.run_coroutine_threadsafe(self.broadcast({
                        "type": "progress",
                        "task_id": task.id,
                        "progress": 100,
                        "speed": "0 B/s",
                        "eta": "0s"
                    }), self.loop)

        # Build format string
        if task.quality_target:
            if task.quality_target == 'audio':
                format_str = "bestaudio/best"
            elif task.quality_target == 'best':
                format_str = "bestvideo+bestaudio/best"
            else:
                h = task.quality_target
                format_str = f"bestvideo[height<={h}]+bestaudio/best[height<={h}]"
        else:
            format_str = f"{task.format_id}/bestvideo+bestaudio/best"

        ydl_opts = {
            'outtmpl': os.path.join(task.save_path, f'%(title)s_{task.id[:8]}.%(ext)s'),
            'format': format_str,
            'logger': MyLogger(),
            'progress_hooks': [progress_hook],
            'merge_output_format': 'mp4' if 'audio' not in format_str else None,
            'continuedl': True,
            'quiet': True,
            'color': 'no_color',
            'socket_timeout': 15,
            'force_ipv4': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'referer': 'https://www.youtube.com/',
        }
        
        # Add cookies if present
        if os.path.exists(self.cookies_path):
            ydl_opts['cookiefile'] = self.cookies_path
            print(f"DEBUG: Download worker using cookies from: {self.cookies_path}")

        # Add proxy if available
        if self.proxy_manager:
            status = self.proxy_manager.get_status()
            if status.get("working_proxies"):
                ydl_opts['proxy'] = status["working_proxies"][0]
                print(f"DEBUG: Download worker using proxy: {ydl_opts['proxy']}")

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([task.url])
            
            if not task._stop_event.is_set():
                task.status = "completed"
                self._save_task_to_db(task)
        except Exception as e:
            if task._stop_event.is_set():
                # Task explicitly stopped or paused
                pass
            else:
                print(f"Download Error for {task.id}: {e}")
                task.status = "error"
                task.error_msg = str(e)
                self._save_task_to_db(task)
        finally:
            if not task._stop_event.is_set() and task.status == "completed" and self.auto_save:
                print(f"Auto-saving task {task.id}")
                self.save_task(task.id)
            
            self._notify_update()
            self._trigger_process()

    async def _notify_update_async(self):
        state = self._get_state()
        await self.broadcast(state)

    def notify(self, message: str, level: str = "info"):
        if self.loop:
            asyncio.run_coroutine_threadsafe(self.broadcast({"type": "notification", "message": message, "level": level}), self.loop)

    def _notify_update(self):
        state = self._get_state()
        if self.loop:
            try:
                asyncio.run_coroutine_threadsafe(self.broadcast(state), self.loop)
            except Exception as e:
                print(f"Broadcast error: {e}")

    def _format_speed(self, speed: float) -> str:
        if speed is None: return "N/A"
        if speed < 1024: return f"{speed:.1f} B/s"
        if speed < 1024 * 1024: return f"{speed/1024:.1f} KB/s"
        return f"{speed/(1024*1024):.1f} MB/s"

    def _format_eta(self, seconds: float) -> str:
        if seconds is None or seconds < 0: return "N/A"
        if seconds > 3600:
            h = int(seconds // 3600)
            m = int((seconds % 3600) // 60)
            return f"{h}h {m}m"
        if seconds > 60:
            m = int(seconds // 60)
            s = int(seconds % 60)
            return f"{m}m {s}s"
        return f"{int(seconds)}s"

    def _get_state(self):
        with self.lock:
            return {
                 "type": "state_update",
                 "tasks": [
                     {
                         "id": tid,
                         "url": self.tasks[tid].url,
                         "title": self.tasks[tid].title,
                         "thumbnail": self.tasks[tid].thumbnail,
                         "status": self.tasks[tid].status,
                         "progress": self.tasks[tid].progress,
                         "speed": self.tasks[tid].speed,
                         "eta": self.tasks[tid].eta,
                         "error_msg": self.tasks[tid].error_msg,
                         "save_path": self.tasks[tid].save_path
                     } for tid in self.queue if tid in self.tasks
                 ]
            }

    def get_task_file_path(self, task_id: str) -> str:
        """Finds the absolute path to a completed task's file in temp folder."""
        with self.lock:
            temp_filename_base = f'_{task_id[:8]}.'
            
            if os.path.exists(self.temp_save_path):
                for file in os.listdir(self.temp_save_path):
                    if temp_filename_base in file:
                        return os.path.join(self.temp_save_path, file)
        return None

    def save_task(self, task_id: str) -> bool:
        """Just marks a task as 'saved' (downloaded) without deleting the server file."""
        with self.lock:
            if task_id not in self.tasks or self.tasks[task_id].status != "completed":
                return False
            
            task = self.tasks[task_id]
            # We don't remove from queue yet, just mark it so the UI can show 'Downloaded'
            task.status = "downloaded"
            self._save_task_to_db(task)
            
            self.notify(f"Download started for {task.title}! Use the trash icon to clear it from server later.", "success")
            self._notify_update()
            return True
        return False

    def delete_task(self, task_id: str) -> bool:
        """PERMANENTLY deletes the task and its file from the server."""
        with self.lock:
            temp_filename_base = f'_{task_id[:8]}.'
            
            task = self.tasks.get(task_id)
            if task:
                task._stop_event.set()
                self.tasks.pop(task_id, None)
                if task_id in self.queue:
                    self.queue.remove(task_id)

            # 1. Delete the physical file
            import time
            time.sleep(0.5) # Give yt-dlp a moment to close file handles
            
            try:
                for file in os.listdir(self.temp_save_path):
                    if temp_filename_base in file:
                        full_path = os.path.join(self.temp_save_path, file)
                        try:
                            os.remove(full_path)
                            print(f"Deleted server file: {file}")
                        except Exception as e:
                            print(f"File delete failed for {file} (might be locked): {e}")
            except Exception as e:
                print(f"Dir list error: {e}")
            
            # 2. Delete from database
            with self._get_db_conn() as conn:
                conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
                conn.commit()

            if task_id in self.queue:
                self.queue.remove(task_id)
            
            self._notify_update()
            self._trigger_process()
            return True

    def cancel_all(self):
        """PERMANENTLY deletes ALL tasks and EMPTIES the temp folder."""
        with self.lock:
            # 1. Stop all active downloads
            for tid in self.tasks:
                try:
                    self.tasks[tid]._stop_event.set()
                except:
                    pass
            
            # 2. Clear memory immediately
            self.tasks.clear()
            self.queue.clear()
            
            # 3. Give a moment for file handles to breathe
            import time
            time.sleep(0.5)
            
            # 4. Nuke the entire temp folder contents
            if os.path.exists(self.temp_save_path):
                for filename in os.listdir(self.temp_save_path):
                    file_path = os.path.join(self.temp_save_path, filename)
                    try:
                        if os.path.isfile(file_path) or os.path.islink(file_path):
                            os.remove(file_path)
                        elif os.path.isdir(file_path):
                            shutil.rmtree(file_path)
                        print(f"Nuked: {filename}")
                    except Exception as e:
                        print(f"Failed to nuke {filename}: {e}")
            
            # 5. Clear database entirely
            with self._get_db_conn() as conn:
                conn.execute("DELETE FROM tasks")
                conn.commit()
                        
        self._notify_update()
        self._trigger_process()

