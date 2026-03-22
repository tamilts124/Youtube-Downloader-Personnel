const getWsUrl = () => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host // includes port
    
    // Check if we have an override for the websocket URL
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
    
    // In local development (Vite), we likely want to talk to backend on 8000
    if (import.meta.env.DEV) {
        return `${protocol}//${window.location.hostname}:8000/ws`
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
