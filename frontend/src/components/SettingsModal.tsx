import React from 'react'
import { X, Settings2, Zap, Save, Cookie, ShieldCheck, AlertCircle, Trash2, Upload } from 'lucide-react'
import { API_BASE } from '../services/api'

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

  React.useEffect(() => {
    if (show) {
      fetch(`${API_BASE}/api/settings/cookies`)
        .then(res => res.json())
        .then(data => setCookiesExists(data.exists))
        .catch(err => console.error('Failed to fetch cookie status:', err))
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
      if (res.ok) setCookiesExists(true)
    } catch (err) {
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

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="card-friendly w-full max-w-md relative z-10 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
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
  )
}
