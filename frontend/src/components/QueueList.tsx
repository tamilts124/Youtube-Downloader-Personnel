import React from 'react'
import { Youtube, Pause, Play, Trash2, Save } from 'lucide-react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import type { DownloadTask } from '../types'
import { QueueItem } from './QueueItem'

interface QueueListProps {
  tasks: DownloadTask[]
  onDragEnd: (result: DropResult) => void
  onAction: (action: string, task_id: string) => void
  onBulkAction: (action: string) => void
}

export const QueueList: React.FC<QueueListProps> = ({ 
  tasks, 
  onDragEnd, 
  onAction, 
  onBulkAction 
}) => {
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const hasActive = tasks.some(t => t.status === 'downloading' || t.status === 'queued')
  const hasResumable = tasks.some(t => t.status === 'paused' || t.status === 'error')

  return (
    <section className="animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          Your Downloads
          <span className="bg-indigo-600/10 text-indigo-400 text-sm px-3 py-1 rounded-full border border-indigo-500/20">
            {tasks.length}
          </span>
        </h2>

        {tasks.length > 0 && (
          <div className="flex items-center gap-2">
            {hasActive ? (
              <button
                onClick={() => onBulkAction('pause_all')}
                className="btn-secondary flex items-center gap-2 text-xs py-2 px-4 h-10 animate-in fade-in zoom-in-95 duration-300"
              >
                <Pause className="w-4 h-4" /> <span>Pause All</span>
              </button>
            ) : hasResumable ? (
              <button
                onClick={() => onBulkAction('resume_all')}
                className="btn-secondary flex items-center gap-2 text-xs py-2 px-4 h-10 border-indigo-500/30 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 animate-in fade-in zoom-in-95 duration-300"
              >
                <Play className="w-4 h-4" /> <span>Resume All</span>
              </button>
            ) : null}
            <button
              onClick={() => onBulkAction('cancel_all')}
              className="text-xs font-bold px-4 py-2 bg-zinc-900/50 text-zinc-500 hover:text-rose-400 rounded-xl border border-white/5 transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
            {completedCount > 1 && (
              <button 
                onClick={() => onBulkAction('save_all')}
                className="text-xs font-bold px-4 py-2 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl border border-indigo-500/20 transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save All (ZIP)
              </button>
            )}
          </div>
        )}
      </div>
      
      {tasks.length === 0 ? (
        <div className="text-center py-24 glass-card border-dashed border-2 border-white/5 text-zinc-500 flex flex-col items-center gap-4">
          <div className="p-4 bg-zinc-900/50 rounded-full">
            <Youtube className="w-12 h-12 opacity-20" />
          </div>
          <p className="text-lg">Your queue is empty.</p>
          <p className="text-sm opacity-60">Paste a video link above to get started!</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="queue">
            {(provided) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef}
                className="flex flex-col gap-4"
              >
                {tasks.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                      <QueueItem 
                        task={task} 
                        provided={provided} 
                        snapshot={snapshot} 
                        onAction={onAction} 
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </section>
  )
}
