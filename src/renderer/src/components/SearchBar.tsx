import React, { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { IconButton, Spinner } from './ui'

/**
 * Floating search bar (bottom-right, not a modal). Matching commits stay bright
 * in the graph while everything else dims. Opens on Cmd/Ctrl+F, closes on Esc.
 */
export function SearchBar(): React.JSX.Element | null {
  const open = useStore((s) => s.searchOpen)
  const editorOpen = useStore((s) => s.editorOpen)
  const query = useStore((s) => s.searchQuery)
  const matches = useStore((s) => s.searchMatches)
  const loading = useStore((s) => s.searchLoading)
  const setQuery = useStore((s) => s.setSearchQuery)
  const close = useStore((s) => s.closeSearch)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open])

  // The graph is hidden while the diff editor is open, and the editor has its
  // own find bar in the same spot — don't show the commit search there.
  if (!open || editorOpen) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 h-10 pl-3 pr-1.5 rounded-lg border border-app-border bg-app-panel shadow-2xl">
      <Search size={15} className="text-app-muted shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
        placeholder="Search branches, commits, files…"
        className="selectable w-64 bg-transparent outline-none text-[13px] text-app-text placeholder:text-app-muted"
      />
      {query.trim() && (
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-app-muted tabular-nums">
            {matches ? matches.size : 0}
          </span>
          {loading && <Spinner size={12} />}
        </span>
      )}
      <IconButton title="Close (Esc)" onClick={close}>
        <X size={15} />
      </IconButton>
    </div>
  )
}
