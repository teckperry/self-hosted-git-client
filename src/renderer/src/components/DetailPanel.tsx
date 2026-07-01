import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { GitCommit, Copy, CloudOff } from 'lucide-react'
import { useStore } from '../store/useStore'
import { fullDate, initials, colorFromString } from '../lib/format'
import { FileStatusBadge } from './FileStatusBadge'
import type { DiffFile } from '@shared/types'

export function DetailPanel(): React.JSX.Element {
  const selection = useStore((s) => s.selection)
  const commits = useStore((s) => s.commits)
  const status = useStore((s) => s.status)
  const commitDiff = useStore((s) => s.commitDiff)
  const selectedFilePath = useStore((s) => s.selectedFilePath)
  const selectCommitFile = useStore((s) => s.selectCommitFile)
  const loadingDiff = useStore((s) => s.loadingDiff)
  const setFocusZone = useStore((s) => s.setFocusZone)
  const openEditor = useStore((s) => s.openEditor)
  const rewordHead = useStore((s) => s.rewordHead)
  const busy = useStore((s) => s.busy)

  const selectedRef = useRef<HTMLElement | null>(null)
  const setSelRef = useCallback((el: HTMLElement | null) => {
    selectedRef.current = el
  }, [])
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedFilePath])

  const commit = useMemo(
    () => (selection?.type === 'commit' ? commits.find((c) => c.hash === selection.hash) : undefined),
    [selection, commits]
  )

  // The commit at HEAD can be reworded in place (git amend, message-only).
  const isHead =
    !!commit &&
    commit.refs.some((r) => r.type === 'HEAD' || (r.type === 'head' && r.name === status?.current))
  const fullMessage = commit ? (commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject) : ''

  const [draft, setDraft] = useState(fullMessage)
  // Reset the editable draft whenever the selected commit (or its message) changes.
  useEffect(() => {
    setDraft(fullMessage)
  }, [commit?.hash, fullMessage])

  const dirty = isHead && draft.trim() !== '' && draft.trim() !== fullMessage.trim()
  const saveMessage = async (): Promise<void> => {
    if (!dirty) return
    await rewordHead(draft.trim())
    // Amend changes the commit hash, so re-select the new HEAD to keep it shown.
    const st = useStore.getState()
    const head = st.commits.find((c) =>
      c.refs.some((r) => r.type === 'HEAD' || (r.type === 'head' && r.name === st.status?.current))
    )
    if (head) void st.selectCommit(head.hash)
  }

  if (!commit) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-app-muted text-[13px]">
        <GitCommit size={28} className="mb-2 opacity-50" />
        Select a commit to view its details
      </div>
    )
  }

  const activeFile = commitDiff.find((f) => f.newPath === selectedFilePath || f.oldPath === selectedFilePath) ?? null

  return (
    <div className="h-full flex flex-col">
      {/* metadata */}
      <div className="p-3 border-b border-app-border shrink-0">
        <div className="flex items-start gap-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0 mt-0.5"
            style={{ background: colorFromString(commit.authorEmail) }}
          >
            {initials(commit.author)}
          </span>
          <div className="min-w-0 flex-1">
            {!isHead && (
              <div className="text-app-text font-semibold leading-snug selectable">{commit.subject}</div>
            )}
            <div className="text-app-muted text-[12px] mt-0.5">
              <span className="text-app-text">{commit.author}</span>{' '}
              <span className="selectable">{`<${commit.authorEmail}>`}</span> · {fullDate(commit.date)}
            </div>
          </div>
          {!commit.pushed && !commit.refs.some((r) => r.type === 'stash') && (
            <span
              title="Not pushed to any remote"
              className="flex items-center gap-1 px-1.5 h-[18px] rounded bg-app-warning/20 text-app-warning text-[10px] font-medium shrink-0 mt-0.5"
            >
              <CloudOff size={11} /> Not pushed
            </span>
          )}
          <button
            title="Copy SHA"
            onClick={() => navigator.clipboard.writeText(commit.hash)}
            className="flex items-center gap-1 font-mono text-[11px] text-app-muted hover:text-app-text shrink-0"
          >
            {commit.shortHash} <Copy size={12} />
          </button>
        </div>
        {isHead ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  void saveMessage()
                } else if (e.key === 'Escape' && dirty) {
                  e.preventDefault()
                  setDraft(fullMessage)
                }
                e.stopPropagation() // don't trigger the app's global key handling
              }}
              spellCheck={false}
              placeholder="Commit message"
              className="w-full min-h-[3.5rem] max-h-48 overflow-y-auto resize-y px-2 py-1.5 rounded-md bg-app-bg border border-app-border text-[12px] text-app-text/90 leading-relaxed whitespace-pre-wrap break-words outline-none focus:border-app-accent transition-colors selectable"
            />
            {dirty && (
              <div className="flex items-center justify-end gap-2 mt-1.5">
                <span className="text-[11px] text-app-muted mr-auto">⌘/Ctrl+Enter to save · Esc to revert</span>
                <button
                  onClick={() => setDraft(fullMessage)}
                  disabled={busy}
                  className="px-2 py-0.5 rounded border border-app-border text-[12px] text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void saveMessage()}
                  disabled={busy}
                  className="px-2.5 py-0.5 rounded bg-app-accent text-app-accent-fg text-[12px] font-medium disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ) : (
          commit.body && (
            <pre className="mt-2 max-h-32 overflow-y-auto text-[12px] text-app-text/90 whitespace-pre-wrap break-words selectable font-sans">
              {commit.body}
            </pre>
          )
        )}
      </div>

      {/* file list */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-app-muted bg-app-panel/50 sticky top-0">
          {commitDiff.length} changed files
        </div>
        {commitDiff.map((f) => (
          <FileRow
            key={f.newPath || f.oldPath}
            file={f}
            active={f === activeFile}
            innerRef={f === activeFile ? setSelRef : undefined}
            onClick={() => {
              setFocusZone('files')
              selectCommitFile(f.newPath || f.oldPath)
              openEditor()
            }}
          />
        ))}
        {commitDiff.length === 0 && !loadingDiff && (
          <div className="px-3 py-3 text-app-muted text-[12px]">No changes in this commit.</div>
        )}
      </div>
    </div>
  )
}

function FileRow({
  file,
  active,
  innerRef,
  onClick
}: {
  file: DiffFile
  active: boolean
  innerRef?: (el: HTMLButtonElement | null) => void
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      ref={innerRef}
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-3 py-1 text-left text-[12px] ${
        active ? 'bg-app-accent/15' : 'hover:bg-app-hover'
      }`}
    >
      <FileStatusBadge status={file.status} />
      <span className="truncate flex-1 text-app-text">{file.newPath || file.oldPath}</span>
      <span className="text-app-success text-[11px] shrink-0">+{file.additions}</span>
      <span className="text-app-danger text-[11px] shrink-0">−{file.deletions}</span>
    </button>
  )
}
