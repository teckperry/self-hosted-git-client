import React, { useEffect, useMemo, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useStore, type DiffViewMode } from '../store/useStore'
import { DiffViewer } from './DiffViewer'
import { SplitDiffView } from './SplitDiffView'
import { Minimap } from './Minimap'
import { FileStatusBadge } from './FileStatusBadge'
import { IconButton } from './ui'
import type { DiffFile } from '@shared/types'

export function DiffEditor(): React.JSX.Element {
  const selection = useStore((s) => s.selection)
  const commitDiff = useStore((s) => s.commitDiff)
  const selectedFilePath = useStore((s) => s.selectedFilePath)
  const workingDiff = useStore((s) => s.workingDiff)
  const loadingDiff = useStore((s) => s.loadingDiff)
  const diffViewMode = useStore((s) => s.diffViewMode)
  const setDiffViewMode = useStore((s) => s.setDiffViewMode)
  const closeEditor = useStore((s) => s.closeEditor)
  const searchOpen = useStore((s) => s.editorSearchOpen)
  const searchQuery = useStore((s) => s.editorSearchQuery)
  const setSearchQuery = useStore((s) => s.setEditorSearchQuery)
  const closeSearch = useStore((s) => s.closeEditorSearch)

  // Escape closes the code search first (if open), otherwise the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const s = useStore.getState()
      if (s.editorSearchOpen) s.closeEditorSearch()
      else s.closeEditor()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeFile: DiffFile | null =
    selection?.type === 'commit'
      ? commitDiff.find((f) => f.newPath === selectedFilePath || f.oldPath === selectedFilePath) ?? null
      : selection?.type === 'wip'
        ? workingDiff[0] ?? null
        : null

  const scrollRef = useRef<HTMLDivElement>(null)
  const activePath = activeFile ? activeFile.newPath || activeFile.oldPath : null
  const showMinimap = !!activeFile && !activeFile.isBinary && activeFile.hunks.length > 0

  // Count code lines matching the in-editor search (for the find bar).
  const searchMatchCount = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !activeFile) return 0
    let n = 0
    for (const h of activeFile.hunks) for (const l of h.lines) if (l.content.toLowerCase().includes(q)) n++
    return n
  }, [searchQuery, activeFile])

  // Reset scroll to the top when switching file or view mode.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [activePath, diffViewMode])

  return (
    <div className="h-full flex flex-col bg-app-bg">
      {/* toolbar */}
      <div className="shrink-0 flex items-center gap-2 h-9 px-3 bg-app-panel border-b border-app-border">
        {activeFile ? (
          <>
            <FileStatusBadge status={activeFile.status} />
            <span className="truncate text-app-text text-[13px]" title={filePathLabel(activeFile)}>
              {filePathLabel(activeFile)}
            </span>
            <span className="text-app-success text-[12px] shrink-0">+{activeFile.additions}</span>
            <span className="text-app-danger text-[12px] shrink-0">−{activeFile.deletions}</span>
          </>
        ) : (
          <span className="text-app-muted text-[13px]">No file open</span>
        )}

        <div className="flex-1" />

        <ViewToggle mode={diffViewMode} onChange={setDiffViewMode} />

        <IconButton title="Close (Esc)" onClick={closeEditor}>
          <X size={16} />
        </IconButton>
      </div>

      {/* diff + minimap */}
      <div className="flex-1 min-h-0 flex">
        {!showMinimap || !activeFile ? (
          <div className="flex-1 min-w-0">
            <DiffViewer file={activeFile} loading={loadingDiff} />
          </div>
        ) : diffViewMode === 'split' ? (
          <SplitDiffView file={activeFile} primaryRef={scrollRef} searchQuery={searchQuery} />
        ) : (
          <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto bg-app-bg">
            <DiffViewer file={activeFile} searchQuery={searchQuery} />
          </div>
        )}
        {showMinimap && activeFile && (
          <Minimap key={`${diffViewMode}:${activePath ?? ''}`} file={activeFile} scrollRef={scrollRef} />
        )}
      </div>

      {searchOpen && (
        <EditorFindBar
          query={searchQuery}
          count={searchMatchCount}
          onChange={setSearchQuery}
          onClose={closeSearch}
        />
      )}
    </div>
  )
}

function EditorFindBar({
  query,
  count,
  onChange,
  onClose
}: {
  query: string
  count: number
  onChange: (q: string) => void
  onClose: () => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 h-10 pl-3 pr-1.5 rounded-lg border border-app-border bg-app-panel shadow-2xl">
      <Search size={15} className="text-app-muted shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
        placeholder="Find in code…"
        className="selectable w-56 bg-transparent outline-none text-[13px] text-app-text placeholder:text-app-muted"
      />
      {query.trim() && (
        <span className="text-[11px] text-app-muted tabular-nums shrink-0">{count}</span>
      )}
      <IconButton title="Close (Esc)" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

function ViewToggle({
  mode,
  onChange
}: {
  mode: DiffViewMode
  onChange: (mode: DiffViewMode) => void
}): React.JSX.Element {
  return (
    <div className="no-drag flex items-center rounded-md border border-app-border overflow-hidden text-[12px] font-medium">
      {(['inline', 'split'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-2.5 h-7 capitalize transition-colors ${
            mode === m
              ? 'bg-app-accent text-app-accent-fg'
              : 'text-app-muted hover:bg-app-hover hover:text-app-text'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function filePathLabel(file: DiffFile): string {
  if (file.status === 'renamed' && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`
  }
  return file.newPath || file.oldPath
}
