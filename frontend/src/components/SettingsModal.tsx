import React from 'react'
import { X, Settings2, Zap, Save, Cookie, ShieldCheck, AlertCircle, Trash2, Upload, Globe, RefreshCw, CheckCircle2, Download } from 'lucide-react'
import { API_BASE, skipCurrentProxy } from '../services/api'

interface SettingsModalProps {
  show: boolean
  onClose: () => void
  autoSave: boolean
  setAutoSave: (val: boolean) => void
  concurrencyLimit: number
  setConcurrencyLimit: (val: number) => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  show,
  onClose,
  autoSave,
  setAutoSave,
  concurrencyLimit,
  setConcurrencyLimit
}) => {
  const [cookiesExists, setCookiesExists] = React.useState<boolean>(false)
  const [uploading, setUploading] = React.useState<boolean>(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState<boolean>(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Proxy State
  const [proxyStatus, setProxyStatus] = React.useState<{
    status: 'idle' | 'verifying',
    total: number,
    processed: number,
    valid: number,
    last_verified: number | null
  }>({ status: 'idle', total: 0, processed: 0, valid: 0, last_verified: null })
  const [isScraping, setIsScraping] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [showProxyDeleteConfirm, setShowProxyDeleteConfirm] = React.useState(false)
  const proxyFileInputRef = React.useRef<HTMLInputElement>(null)
  
  const refreshProxyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/proxies`)
      const data = await res.json()
      setProxyStatus(data)
    } catch (err) {
      console.error('Failed to fetch proxy status:', err)
    }
  }

  React.useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden'
      setError(null)
      fetch(`${API_BASE}/api/settings/cookies`)
        .then(res => res.json())
        .then(data => setCookiesExists(data.exists))
        .catch(err => console.error('Failed to fetch cookie status:', err))
      
      refreshProxyStatus()
      
      // Poll for status ONLY if verifying, and do it less frequently
      const interval = setInterval(() => {
        if (show) {
          // If we have stats and it says active, refresh it.
          // Otherwise, we can refresh less often.
          refreshProxyStatus()
        }
      }, 5000)
      
      return () => {
        clearInterval(interval)
        document.body.style.overflow = 'unset'
      }
    } else {
      document.body.style.overflow = 'unset'
    }
  }, [show])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/api/settings/cookies/upload`, {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        setCookiesExists(true)
        setError(null)
      } else {
        const data = await res.json()
        setError(data.detail || 'Cookie upload failed')
      }
    } catch (err) {
      setError('Connection error occurred during upload')
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/cookies`, { method: 'DELETE' })
      if (res.ok) {
        setCookiesExists(false)
        setShowDeleteConfirm(false)
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleProxyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/api/settings/proxies/upload`, {
        method: 'POST',
        body: formData
      })
      if (res.ok) {
        refreshProxyStatus()
        setError(null)
      } else {
        const data = await res.json()
        setError(data.detail || 'Proxy upload failed')
      }
    } catch (err) {
      setError('Connection error occurred during proxy upload')
      console.error('Proxy upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleScrape = async () => {
    setIsScraping(true)
    try {
      const res = await fetch(`${API_BASE}/api/settings/proxies/scrape`, { method: 'POST' })
      if (res.ok) refreshProxyStatus()
    } catch (err) {
      console.error('Scrape failed:', err)
    } finally {
      setIsScraping(false)
    }
  }

  const handleVerify = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/proxies/verify`, { method: 'POST' })
      if (res.ok) refreshProxyStatus()
    } catch (err) {
      console.error('Verify failed:', err)
    }
  }

  const handleDeleteProxies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/proxies`, { method: 'DELETE' })
      if (res.ok) {
        refreshProxyStatus()
        setShowProxyDeleteConfirm(false)
      }
    } catch (err) {
      console.error('Delete proxies failed:', err)
    }
  }

  const handleExportProxies = async () => {
    try {
      const exportUrl = `${API_BASE}/api/settings/proxies/export`
      console.log('Exporting from:', exportUrl)
      const res = await fetch(exportUrl)
      const blob = await res.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = 'valid_proxies.txt'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      {/* Fixed Backdrop - stays put while scrolling */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onClose}
      />

      {/* Scrollable container on top of backdrop */}
      <div className="fixed inset-0 overflow-y-auto py-8 px-4 flex justify-center items-start pointer-events-none">
        <div className="card-friendly w-full max-w-md relative z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 pointer-events-auto">
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
            <div className="p-1 bg-red-500/20 rounded-lg text-red-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 transition-colors">
              <span className="sr-only">Dismiss</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl">
              <Settings2 className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Your Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* YouTube Authentication Section */}
          <div className="p-4 bg-zinc-800/20 rounded-2xl overflow-hidden active:outline-none focus:outline-none focus:ring-0">
            <div className="flex items-center gap-2 mb-4">
              <Cookie className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-semibold text-white">YouTube Authentication</p>
            </div>
            
            {cookiesExists ? (
              <div className="relative">
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-3 animate-in slide-in-from-right-4 duration-300">
                    <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex-1">Remove Cookies?</p>
                    <div className="flex gap-2">
                       <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded-lg transition-colors outline-none focus:outline-none focus:ring-0 ring-0 border-none"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleDelete}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-lg shadow-red-500/20 outline-none focus:outline-none focus:ring-0 ring-0 border-none"
                      >
                        Yes, Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-xl animate-in fade-in duration-300">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400">Authenticated ✅</span>
                    </div>
                    <button 
                      onClick={() => setShowDeleteConfirm(true)}
                      className="p-2 text-zinc-500 hover:text-red-400 transition-colors bg-white/5 hover:bg-white/10 rounded-lg outline-none focus:outline-none focus:ring-0 ring-0 border-none"
                      title="Remove Cookies"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 rounded-xl text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] leading-tight font-medium">Bypass "Sign in to confirm you're not a bot" by providing your cookies.</span>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleUpload} 
                  accept=".txt" 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl border border-dashed border-white/5 transition-all flex items-center justify-center gap-2 outline-none focus:outline-none focus:ring-0"
                >
                  {uploading ? "Uploading..." : <><Upload className="w-3.5 h-3.5" /> Upload cookies.txt</>}
                </button>
              </div>
            )}
          </div>

          {/* Proxy Management Section */}
          <div className="p-4 bg-zinc-800/20 rounded-2xl overflow-hidden active:outline-none focus:outline-none focus:ring-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400" />
                <p className="text-sm font-semibold text-white">Proxy Management</p>
              </div>
              {proxyStatus.total > 0 && !showProxyDeleteConfirm && (
                <button 
                  onClick={() => setShowProxyDeleteConfirm(true)}
                  className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {showProxyDeleteConfirm ? (
              <div className="flex items-center gap-3 p-2 bg-red-500/5 rounded-xl animate-in slide-in-from-right-4 duration-300">
                <p className="text-[11px] font-bold text-red-400 uppercase tracking-wider flex-1">Clear Proxies?</p>
                <div className="flex gap-2">
                   <button 
                    onClick={() => setShowProxyDeleteConfirm(false)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded-lg transition-colors border-none outline-none"
                  >
                    No
                  </button>
                  <button 
                    onClick={handleDeleteProxies}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg transition-colors shadow-lg shadow-red-500/20 border-none outline-none"
                  >
                    Yes, Clear
                  </button>
                </div>
              </div>
            ) : proxyStatus.total > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Total List</p>
                    <p className="text-lg font-bold text-white">{proxyStatus.total}</p>
                  </div>
                  <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                    <p className="text-[10px] font-bold text-emerald-500/60 uppercase mb-1 tracking-wider">Working</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-lg font-bold text-emerald-400">{proxyStatus.valid}</p>
                      {proxyStatus.valid > 0 && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] text-zinc-500 font-medium">
                    {proxyStatus.last_verified 
                      ? `Last Verified: ${new Date(proxyStatus.last_verified * 1000).toLocaleString([], {hour: '2-digit', minute:'2-digit'})}`
                      : 'Never verified'}
                  </p>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleExportProxies}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest"
                    >
                      <Download className="w-3 h-3" />
                      Export Valid
                    </button>
                    <button 
                      onClick={handleVerify}
                      disabled={proxyStatus.status === 'verifying'}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${proxyStatus.status === 'verifying' ? 'animate-spin' : ''}`} />
                      {proxyStatus.status === 'verifying' 
                        ? `Verify ${proxyStatus.processed}/${proxyStatus.total}` 
                        : 'Verify Now'}
                    </button>
                  </div>
                </div>

                {proxyStatus.valid > 0 && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-amber-200 font-bold text-sm">Switch Connection</h4>
                        <p className="text-[11px] text-amber-200/60 mt-0.5 leading-tight">
                          If downloads are stuck or slow, click here to try a fresh identity. Progress will be paused for safety.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await skipCurrentProxy();
                        window.location.reload();
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs rounded-xl transition-all border border-amber-500/30 active:scale-[0.98]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Discard Top Proxy & Rotate
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-sky-500/10 rounded-xl text-sky-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-[11px] leading-tight font-medium">Add proxies to ensure stable downloads in high-traffic regions.</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                   <input type="file" ref={proxyFileInputRef} onChange={handleProxyUpload} accept=".txt" className="hidden" />
                   <button 
                    onClick={() => proxyFileInputRef.current?.click()}
                    disabled={uploading}
                    className="py-2.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded-xl border border-dashed border-white/5 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3 h-3" /> Upload .txt
                  </button>
                  <button 
                    onClick={handleScrape}
                    disabled={isScraping}
                    className="py-2.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 text-[10px] font-bold rounded-xl border border-sky-400/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScraping ? 'animate-spin' : ''}`} />
                    {isScraping ? 'Scraping...' : 'Scrape Free'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-800/20 rounded-2xl">
            <div>
              <p className="text-sm font-semibold text-white">Auto-Save Finished Work</p>
              <p className="text-xs text-zinc-500">I'll automatically save videos when they finish.</p>
            </div>
            <button
              onClick={() => setAutoSave(!autoSave)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 outline-none focus:ring-0 ${autoSave ? 'bg-indigo-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${autoSave ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="p-4 bg-zinc-800/20 rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-semibold text-white">Download Limit</p>
              </div>
              <span className="text-indigo-400 font-bold bg-indigo-400/10 px-3 py-1 rounded-lg text-xs border border-indigo-400/20">{concurrencyLimit} at a time</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="5" 
              step="1"
              value={concurrencyLimit}
              onChange={(e) => setConcurrencyLimit(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer outline-none focus:ring-0"
            />
            <div className="flex justify-between mt-2 text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">
              <span>Relaxed</span>
              <span>Flash Mode</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-10 btn-primary flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" /> <span>Looks Good!</span>
        </button>
      </div>
    </div>
  </div>
)
}
