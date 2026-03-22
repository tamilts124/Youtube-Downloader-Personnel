import React from 'react'
import { Download } from 'lucide-react'
import type { VideoInfo } from '../types'

interface VideoPreviewProps {
  videoInfo: VideoInfo
  selectedFormat: string
  setSelectedFormat: (format: string) => void
  onDownload: () => void
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoInfo,
  selectedFormat,
  setSelectedFormat,
  onDownload
}) => {
  const formatSize = (bytes?: number) => {
    if (!bytes) return ""
    return `(${(bytes / (1024 * 1024)).toFixed(1)} MB)`
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '00:00'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)

    const mm = m.toString().padStart(2, '0')
    const ss = s.toString().padStart(2, '0')
    const hh = h.toString().padStart(2, '0')

    if (d > 0) {
      return `${d}d ${hh}:${mm}:${ss}`
    }
    if (h > 0) {
      return `${hh}:${mm}:${ss}`
    }
    return `${mm}:${ss}`
  }

  return (
    <div className="mt-12 flex flex-col md:flex-row gap-8 animate-in slide-in-from-top-4 fade-in duration-500">
      <div className="relative group flex-shrink-0">
        <img src={videoInfo.thumbnail || ''} alt="Thumbnail" className="w-full md:w-64 h-full min-h-[140px] object-cover rounded-[1.5rem] shadow-2xl group-hover:scale-[1.02] transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent rounded-[1.5rem] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex-1 flex flex-col">
        <h3 className="text-xl font-semibold text-white leading-tight">{videoInfo.title || 'Untitled Content'}</h3>
        <p className="flex items-center gap-2 text-zinc-400 text-sm mt-3 font-medium">
          <span className="bg-zinc-800/50 px-2 py-0.5 rounded-lg text-zinc-500 text-xs">{videoInfo.uploader || 'Unknown'}</span>
          {!videoInfo.is_playlist && (
            <>
              <span className="w-1 h-1 bg-zinc-700 rounded-full" />
              <span className="text-indigo-400/80">{formatDuration(videoInfo.duration)}</span>
            </>
          )}
        </p>

        <div className="mt-2 flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:flex-1 min-w-[200px]">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 ml-1">Choose Quality</p>
            {videoInfo.is_playlist ? (
              <select
                className="w-full bg-zinc-800/50 border border-zinc-700/50 text-sm rounded-xl px-4 py-[14px] focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all appearance-none cursor-pointer"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
              >
                {videoInfo.quality_options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full bg-zinc-800/50 border border-zinc-700/50 text-sm rounded-xl px-4 py-[14px] focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all appearance-none cursor-pointer"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
              >
                {videoInfo.formats?.map((f, i) => (
                  <option key={f.format_id + i} value={f.format_id}>
                    {f.vcodec !== 'none' ? '🎬' : '🎵'} {f.resolution} {f.ext.toUpperCase()} {formatSize(f.filesize_approx)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={onDownload}
            className="w-full sm:w-auto btn-primary flex items-center justify-center gap-3 px-8 py-3.5"
          >
            <Download className="w-5 h-5" />
            <span>{videoInfo.is_playlist ? `Save Playlist (${videoInfo.playlist_count || 0} items)` : 'Save Content'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
