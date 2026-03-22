import React from 'react'
import { X, Settings2, Zap, Save } from 'lucide-react'

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

        <div className="space-y-8">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
            <div>
              <p className="text-sm font-semibold text-white">Auto-Save Finished Work</p>
              <p className="text-xs text-zinc-500">I'll automatically save videos when they finish.</p>
            </div>
            <button
              onClick={() => setAutoSave(!autoSave)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${autoSave ? 'bg-indigo-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${autoSave ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
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
              className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
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
