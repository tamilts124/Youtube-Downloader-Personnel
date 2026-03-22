from pydantic import BaseModel
from typing import List, Optional, Dict

class TaskActionRequest(BaseModel):
    task_id: str

class VideoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    title: str
    thumbnail: str
    is_playlist: bool = False
    quality_target: Optional[str] = None

class PriorityRequest(BaseModel):
    queue: List[str]

class ActionRequest(BaseModel):
    task_id: str

class ConcurrencyRequest(BaseModel):
    limit: int
