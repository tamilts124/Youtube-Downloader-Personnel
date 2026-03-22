import { useState, useEffect, useCallback, useRef } from 'react'
import type { DropResult } from '@hello-pangea/dnd'

// Types
import type { VideoInfo, DownloadTask } from './types'

// Services
import * as api from './services/api'
import { createWebSocket } from './services/websocket'

// Components
import { Header } from './components/Header'
import { DownloadInput } from './components/DownloadInput'
import { VideoPreview } from './components/VideoPreview'
import { QueueList } from './components/QueueList'
import { SettingsModal } from './components/SettingsModal'

// Context
import { NotificationProvider, useNotification } from './context/NotificationContext'

function AppContent() {
  const { showNotification } = useNotification()
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const deletedIds = useRef<Set<string>>(new Set())
  
  const [autoSave, setAutoSave] = useState(() => {
    const saved = localStorage.getItem('nexus_autosave')
    return saved === 'true'
  })
  
  const [concurrencyLimit, setConcurrencyLimit] = useState(() => {
    const saved = localStorage.getItem('nexus_concurrency')
    return saved ? parseInt(saved, 10) : 2
  })

  const wsRef = useRef<WebSocket | null>(null)

  // Sync settings with both localStorage and backend
  useEffect(() => {
    localStorage.setItem('nexus_autosave', String(autoSave))
    api.setAutoSaveApi(autoSave).catch(console.error)
  }, [autoSave])

  useEffect(() => {
    localStorage.setItem('nexus_concurrency', String(concurrencyLimit))
    api.setConcurrencyLimitApi(concurrencyLimit).catch(console.error)
  }, [concurrencyLimit])

  // WebSocket connection management
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) wsRef.current.close()

    const ws = createWebSocket(
      (data) => {
        if (data.type === 'progress') {
          setTasks(prev => prev.map(t => {
            if (t.id === data.task_id) {
               return { ...t, progress: data.progress, speed: data.speed, eta: data.eta, status: data.progress === 100 ? 'completed' : t.status }
            }
            return t
          }))
        } else if (data.type === 'notification') {
          showNotification(data.message, (data.level as any) || 'info')
        } else if (data.type === 'state_update') {
          // Filter out tasks that were recently deleted to prevent ghosting
          const filteredTasks = data.tasks.filter((t: DownloadTask) => !deletedIds.current.has(t.id));
          setTasks(filteredTasks)
        }
      },
      () => {
        wsRef.current = null
        setTimeout(connectWebSocket, 3000)
      }
    )
    wsRef.current = ws
  }, [showNotification])

  useEffect(() => {
    connectWebSocket()
    return () => wsRef.current?.close()
  }, [connectWebSocket])

  const autoDownloadedRef = useRef<Set<string>>(new Set());

  const downloadTaskFile = async (task: DownloadTask) => {
    try {
      showNotification(`Downloading ${task.title} to your device...`, "info");
      
      const blob = await api.fetchFileBlob(task.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = task.title + '.mp4'; // Fallback name
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Remove from list immediately for snappy feel
      setTasks(prev => prev.filter(t => t.id !== task.id));
      
      // Tell server to delete
      await api.removeTask(task.id);
    } catch (err) {
      showNotification("Failed to download file to device.", "error");
      console.error(err);
    }
  };

  // Auto-download effect for remote clients/mobile
  useEffect(() => {
    if (!autoSave) return;

    tasks.forEach(task => {
      if (task.status === 'completed' && !autoDownloadedRef.current.has(task.id)) {
        autoDownloadedRef.current.add(task.id);
        downloadTaskFile(task);
      }
    });
  }, [tasks, autoSave]);

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return

    setFetching(true)
    setVideoInfo(null)
    
    try {
      const data = await api.fetchVideoInfo(url)
      if (data.error === "bot_detection") {
        showNotification("YouTube wants you to sign in. Click the settings icon ⚙️ to upload your cookies file!", "error")
      } else if (data.error) {
        showNotification("Oops! We couldn't find that video. Please check the link.", "error")
      } else {
        setVideoInfo(data)
        if (data.is_playlist) {
          setSelectedFormat('best')
        } else if (data.formats && data.formats.length > 0) {
          setSelectedFormat(data.formats[0].format_id)
        }
      }
    } catch (err) {
      showNotification("Trouble connecting to the downloader. Is the backend running?", "error")
    } finally {
      setFetching(false)
    }
  }

  const handleDownload = async () => {
    if (!videoInfo || !selectedFormat) return
    try {
      await api.startDownload({ 
        url, 
        format_id: videoInfo.is_playlist ? 'best' : selectedFormat, 
        quality_target: videoInfo.is_playlist ? selectedFormat : null,
        title: videoInfo.title, 
        thumbnail: videoInfo.thumbnail,
        is_playlist: videoInfo.is_playlist 
      })
      setUrl('')
      setVideoInfo(null)
      showNotification("Starting your download!", "success")
    } catch (err) {
      showNotification("Failed to start download. Try again?", "error")
    }
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return
    
    const items = Array.from(tasks)
    const [reorderedItem] = items.splice(result.source.index, 1)
    items.splice(result.destination.index, 0, reorderedItem)

    setTasks(items)
    await api.updatePriority(items.map(i => i.id))
  }

  const handleAction = async (action: string, task_id: string) => {
    try {
      if (action === 'resubmit') {
        await api.resubmitTask(task_id)
        showNotification("Restarting download...", "info")
        return
      }
      
      // All these actions should remove the task from the active list
      if (action === 'delete' || action === 'cancel' || action === 'save') {
        const task = tasks.find(t => t.id === task_id);
        
        // Anti-Ghosting: Add to deletedIds set immediately
        deletedIds.current.add(task_id);

        // Snappy UI: Remove from list first
        setTasks(prev => prev.filter(t => t.id !== task_id));

        if (action === 'save' && task) {
             await downloadTaskFile(task);
        } else {
             await api.removeTask(task_id);
        }

        // Clean up deletedIds after 10s
        setTimeout(() => {
          deletedIds.current.delete(task_id);
        }, 10000);

        return;
      }

      await api.sendAction(action, task_id);
    } catch (err) {
      showNotification("Oops! Something went wrong. Please try again.", "error")
      console.error("Error:", err);
    }
  }

  const handleBulkAction = async (action: string) => {
    const data = await api.sendBulkAction(action)
    if (data.status === 'error') {
      showNotification(data.message, "error")
    } else if (action === 'save_all') {
        showNotification("All finished videos are being saved!", "success")
    } else if (action === 'resume_all') {
        showNotification("All downloads resumed!", "success")
    } else if (action === 'pause_all') {
        showNotification("All downloads paused.", "info")
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6 md:p-12 min-h-screen">
      <Header onShowSettings={() => setShowSettings(true)} />

      <section className="card-friendly mb-8">
        <DownloadInput 
          url={url} 
          setUrl={setUrl} 
          fetching={fetching} 
          onFetch={handleFetch} 
        />

        {videoInfo && (
          <VideoPreview 
            videoInfo={videoInfo} 
            selectedFormat={selectedFormat} 
            setSelectedFormat={setSelectedFormat} 
            onDownload={handleDownload} 
          />
        )}
      </section>

      <QueueList 
        tasks={tasks} 
        onDragEnd={handleDragEnd} 
        onAction={handleAction} 
        onBulkAction={handleBulkAction} 
      />

      <SettingsModal 
        show={showSettings} 
        onClose={() => setShowSettings(false)} 
        autoSave={autoSave} 
        setAutoSave={setAutoSave} 
        concurrencyLimit={concurrencyLimit} 
        setConcurrencyLimit={setConcurrencyLimit} 
      />
    </div>
  )
}

function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  )
}

export default App
