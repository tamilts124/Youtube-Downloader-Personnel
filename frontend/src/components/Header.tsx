import React from 'react'
import { Youtube, Settings2 } from 'lucide-react'

interface HeaderProps {
  onShowSettings: () => void
}

export const Header: React.FC<HeaderProps> = ({ onShowSettings }) => {
  return (
    <header className="flex items-center justify-between mb-12">
      <div className="flex items-center gap-3 group">
        <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-600/30 group-hover:scale-110 transition-transform duration-300">
          <Youtube className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">YouTube Downloader</h1>
          <p className="text-xs font-medium text-indigo-400 uppercase tracking-widest opacity-80">Simple • Fast • Personal</p>
        </div>
      </div>
      
      <button 
        onClick={onShowSettings}
        className="p-3 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-2xl transition-all hover:rotate-90 duration-500"
        title="Settings"
      >
        <Settings2 className="w-6 h-6" />
      </button>
    </header>
  )
}
