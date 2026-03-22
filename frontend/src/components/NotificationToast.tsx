import React, { useEffect } from 'react'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

export type NotificationType = 'success' | 'error' | 'info'

interface ToastProps {
  id: string
  message: string
  type?: NotificationType
  onClose: (id: string) => void
}

export const NotificationToast: React.FC<ToastProps> = ({ id, message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 5000)
    return () => clearTimeout(timer)
  }, [id, onClose])

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400" />,
    info: <Info className="w-5 h-5 text-indigo-400" />
  }

  const bgColors = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    error: 'bg-rose-500/10 border-rose-500/20',
    info: 'bg-indigo-500/10 border-indigo-500/20'
  }

  return (
    <div className={`flex items-center gap-3 p-4 pr-12 rounded-2xl border backdrop-blur-md shadow-2xl animate-slide-in pointer-events-auto min-w-[320px] max-w-md ${bgColors[type]}`}>
      <div className="flex-shrink-0">{icons[type]}</div>
      <p className="text-sm font-medium text-white/90">{message}</p>
      <button 
        onClick={() => onClose(id)}
        className="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
