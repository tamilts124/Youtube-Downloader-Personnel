const getWsUrl = () => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // If we're in development (localhost:5173), we likely want to talk to localhost:8000
    // But if we're deployed (same port for both), we just use the current host:port
    const host = window.location.host // includes port
    
    // Check if we have an override for the websocket URL
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
    
    // In production (FastAPI serving React), host will be the same
    // In local dev (Vite), host is localhost:5173, so we might need a fallback to :8000
    if (host.includes('localhost:5173')) {
        return `${protocol}//localhost:8000/ws`
    }
    
    return `${protocol}//${host}/ws`
  }
  return 'ws://localhost:8000/ws'
}

const WS_URL = getWsUrl()

export const createWebSocket = (
  onMessage: (data: any) => void,
  onClose: () => void
): WebSocket => {
  const ws = new WebSocket(WS_URL)
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch (err) {
      console.error("WebSocket message parsing error", err)
    }
  }

  ws.onclose = onClose

  return ws
}
