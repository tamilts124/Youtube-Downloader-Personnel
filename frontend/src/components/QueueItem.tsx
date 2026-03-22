import { GripVertical, Save, Trash2, Pause, Play, RotateCcw } from 'lucide-react'
import type { DownloadTask, TaskStatus } from '../types'

interface QueueItemProps {
  task: DownloadTask
  provided: any
  snapshot: any
  onAction: (action: string, task_id: string) => void
}

export const QueueItem: React.FC<QueueItemProps> = ({ task, provided, snapshot, onAction }) => {
  const getStatusLabel = (status: TaskStatus) => {
    switch (status) {
      case 'downloading': return 'Processing...'
      case 'completed': return 'Ready'
      case 'error': return 'Something went wrong'
      case 'paused': return 'Paused'
      case 'queued': return 'Waiting in line'
      case 'saving': return 'Downloading to Device...'
      default: return status
    }
  }

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'downloading': return 'text-indigo-400'
      case 'completed': return 'text-emerald-400'
      case 'saving': return 'text-sky-400'
      case 'error': return 'text-rose-400'
      case 'paused': return 'text-amber-400'
      default: return 'text-zinc-500'
    }
  }

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.9 : 1
      }}
      className={`glass-card ${snapshot.isDragging ? 'border-indigo-500/50 shadow-2xl' : 'border-white/5'} flex flex-col sm:flex-row items-center gap-4 transition-all duration-300 group`}
    >
      <div {...provided.dragHandleProps} className="hidden sm:block cursor-grab p-1 text-zinc-600 hover:text-zinc-400">
        <GripVertical className="w-5 h-5" />
      </div>
      
      {task.thumbnail && (
        <div className="relative flex-shrink-0">
          <img src={task.thumbnail} alt="" className="w-full sm:w-24 aspect-video object-cover rounded-xl shadow-lg" />
          {task.status === 'downloading' && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                <Play className="w-6 h-6 text-white animate-pulse" />
             </div>
          )}
        </div>
      )}
      
      <div className="flex-1 min-w-0 w-full">
        <div className="flex justify-between items-start mb-2 gap-4">
          <h4 className="text-sm font-medium truncate text-zinc-200">{task.title}</h4>
          <span className={`text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${getStatusColor(task.status)}`}>
            {getStatusLabel(task.status)}
          </span>
        </div>
        
        <div className="w-full bg-white/5 rounded-full h-2 mb-2 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-700 ease-out ${task.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : task.status === 'error' ? 'bg-rose-500' : 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]'}`}
            style={{ width: `${Math.max(0, Math.min(100, task.progress || 0))}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between items-center text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
          <span className="text-zinc-400">{task.progress?.toFixed(0) || 0}% {task.status === 'saving' ? 'Downloaded' : 'Done'}</span>
          <div className="flex gap-4">
            {(task.status === 'downloading' || task.status === 'saving') && (
              <>
                <span className="text-indigo-400/80">{task.speed}</span>
                <span className="text-zinc-400">{task.eta} left</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-white/5 sm:border-0">
        {task.status === 'completed' || task.status === 'downloaded' ? (
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => onAction('save', task.id)} 
              className="flex-1 sm:flex-none py-2 px-4 flex items-center justify-center gap-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-sm font-medium transition-all duration-300"
            >
              <Save className="w-4 h-4" /> Save
            </button>
            <button 
              onClick={() => onAction('delete', task.id)} 
              className="p-2.5 text-zinc-500 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-all"
              title="Remove"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <>
            {(task.status === 'downloading' || task.status === 'queued') && (
              <button onClick={() => onAction('pause', task.id)} className="p-2.5 text-zinc-500 hover:text-amber-400 hover:bg-white/5 rounded-xl transition-all" title="Pause">
                <Pause className="w-5 h-5" />
              </button>
            )}
            {(task.status === 'paused' || task.status === 'error') && (
              <button onClick={() => onAction('resume', task.id)} className="p-2.5 text-zinc-500 hover:text-indigo-400 hover:bg-white/5 rounded-xl transition-all" title="Resume">
                <Play className="w-5 h-5" />
              </button>
            )}
            {task.status === 'error' && (
              <button onClick={() => onAction('resubmit', task.id)} className="p-2.5 text-zinc-500 hover:text-indigo-400 hover:bg-white/5 rounded-xl transition-all" title="Try again">
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={() => onAction('cancel', task.id)} 
              className="p-2.5 text-zinc-500 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-all"
              title="Remove"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
