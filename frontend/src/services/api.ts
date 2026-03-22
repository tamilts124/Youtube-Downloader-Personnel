import type { VideoInfo } from '../types'

const getApiBase = () => {
  const envUrl = import.meta.env.VITE_API_URL as string
  if (envUrl) return envUrl

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:8000`
  }
  return '' // Relative for production
}

export const API_BASE = getApiBase()

export const fetchVideoInfo = async (url: string): Promise<VideoInfo> => {
  const res = await fetch(`${API_BASE}/api/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  return res.json()
}

export const startDownload = async (data: {
  url: string,
  format_id: string,
  quality_target?: string | null,
  title: string,
  thumbnail?: string,
  is_playlist?: boolean
}) => {
  return fetch(`${API_BASE}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
}

export const sendAction = async (action: string, task_id: string) => {
  return fetch(`${API_BASE}/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id })
  })
}

export const sendBulkAction = async (action: string) => {
  const res = await fetch(`${API_BASE}/api/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  return res.json()
}

export const updatePriority = async (queue: string[]) => {
  return fetch(`${API_BASE}/api/priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queue })
  })
}

export const setConcurrencyLimitApi = async (limit: number) => {
  return fetch(`${API_BASE}/api/settings/concurrency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit })
  })
}
export const setAutoSaveApi = async (auto_save: boolean) => {
  return fetch(`${API_BASE}/api/settings/autosave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_save })
  })
}

export const resubmitTask = async (task_id: string) => {
  return fetch(`${API_BASE}/api/resubmit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id })
  })
}
export const removeTask = async (task_id: string) => {
  return fetch(`${API_BASE}/api/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id })
  })
}

export const fetchFileBlob = async (task_id: string): Promise<Blob> => {
  const res = await fetch(`${API_BASE}/api/download/${task_id}`);
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

export const rotateProxy = async (task_id: string) => {
  return fetch(`${API_BASE}/api/proxy/rotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id })
  })
}

export const skipCurrentProxy = async () => {
  return fetch(`${API_BASE}/api/proxy/skip_current`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
}
