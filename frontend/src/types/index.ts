export type Format = {
  format_id: string
  ext: string
  resolution: string
  note: string
  acodec: string
  vcodec: string
  filesize_approx: number
}

export type VideoInfo = {
  title?: string
  thumbnail?: string
  duration?: number
  uploader?: string
  formats?: Format[]
  error?: string
  message?: string
  is_playlist?: boolean
  playlist_count?: number
  quality_options?: { label: string, value: string }[]
}

export type TaskStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'downloaded' | 'error' | 'cancelled' | 'saving'

export type DownloadTask = {
  id: string
  url: string
  title: string
  thumbnail?: string
  status: TaskStatus
  progress: number
  speed: string
  eta: string
  error_msg: string
  save_path: string
}
