import React from 'react'
import { Link2, Loader2, ArrowRight } from 'lucide-react'

interface DownloadInputProps {
  url: string
  setUrl: (url: string) => void
  fetching: boolean
  onFetch: (e: React.FormEvent) => void
}

export const DownloadInput: React.FC<DownloadInputProps> = ({ url, setUrl, fetching, onFetch }) => {
  return (
    <form onSubmit={onFetch} className="relative group">
      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
        <Link2 className="w-5 h-5" />
      </div>
      <input
        type="text"
        placeholder="Paste a YouTube link here..."
        className="w-full input-friendly pl-14 pr-44"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={fetching}
      />
      <button
        type="submit"
        disabled={fetching || !url}
        className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary py-2 px-6 flex items-center gap-2"
      >
        {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span className="hidden sm:inline">Get Content</span> <ArrowRight className="w-4 h-4" /></>}
      </button>
    </form>
  )
}
