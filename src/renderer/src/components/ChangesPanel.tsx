import React, { useState } from 'react'
import { Plus, Minus, Undo2, Check, FileEdit } from 'lucide-react'
import { useStore } from '../store/useStore'
import { DiffViewer } from './DiffViewer'
import { FileStatusBadge } from './FileStatusBadge'
import { Button } from './ui'
import { ConfirmModal } from './PromptModal'
import type { FileChange } from '@shared/types'

export function ChangesPanel(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const workingFile = useStore((s) => s.workingFile)
  const workingDiff = useStore((s) => s.workingDiff)
  const loadingDiff = useStore((s) => s.loadingDiff)
  const selectWorkingFile = useStore((s) => s.selectWorkingFile)
  const stage = useStore((s) => s.stage)
  const unstage = useStore((s) => s.unstage)
  const stageAll = useStore((s) => s.stageAll)
  const unstageAll = useStore((s) => s.unstageAll)
  const discard = useStore((s) => s.discard)
  const commit = useStore((s) => s.commit)
  const busy = useStore((s) => s.busy)

  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState<FileChange | null>(null)

  if (!status) return <div className="h-full" />

  const stagedCount = status.staged.length
  const canCommit = stagedCount > 0 && message.trim().length > 0 && !busy

  const doCommit = (): void => {
    if (!canCommit) return
    commit(message.trim(), amend)
    setMessage('')
    setAmend(false)
  }

  const activeFile = workingDiff[0] ?? null

  return (
    <div className="h-full flex flex-col">
      {/* file lists */}
      <div className="shrink-0 max-h-[42%] overflow-auto border-b border-app-border">
        <ListHeader
          title={`Unstaged (${status.unstaged.length})`}
          action={
            status.unstaged.length > 0 ? (
              <button
                className="text-[11px] text-app-accent hover:underline"
                onClick={() => stageAll()}
              >
                Stage all
              </button>
            ) : null
          }
        />
        {status.unstaged.map((f) => (
          <ChangeRow
            key={`u-${f.path}`}
            file={f}
            active={!!workingFile && !workingFile.staged && workingFile.path === f.path}
            onClick={() => selectWorkingFile(f)}
            actions={
              <>
                <RowAction title="Discard changes" onClick={() => setConfirmDiscard(f)}>
                  <Undo2 size={13} />
                </RowAction>
                <RowAction title="Stage" onClick={() => stage([f.path])}>
                  <Plus size={14} />
                </RowAction>
              </>
            }
          />
        ))}
        {status.unstaged.length === 0 && <Empty>Nothing to stage</Empty>}

        <ListHeader
          title={`Staged (${status.staged.length})`}
          action={
            status.staged.length > 0 ? (
              <button
                className="text-[11px] text-app-accent hover:underline"
                onClick={() => unstageAll()}
              >
                Unstage all
              </button>
            ) : null
          }
        />
        {status.staged.map((f) => (
          <ChangeRow
            key={`s-${f.path}`}
            file={f}
            active={!!workingFile && workingFile.staged && workingFile.path === f.path}
            onClick={() => selectWorkingFile(f)}
            actions={
              <RowAction title="Unstage" onClick={() => unstage([f.path])}>
                <Minus size={14} />
              </RowAction>
            }
          />
        ))}
        {status.staged.length === 0 && <Empty>No staged files</Empty>}
      </div>

      {/* diff */}
      <div className="flex-1 min-h-0">
        {activeFile ? (
          <DiffViewer file={activeFile} loading={loadingDiff} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-app-muted text-[13px]">
            <FileEdit size={26} className="mb-2 opacity-50" />
            Select a file to view its changes
          </div>
        )}
      </div>

      {/* commit box */}
      <div className="shrink-0 border-t border-app-border p-3 bg-app-panel">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={stagedCount > 0 ? 'Commit message…' : 'Stage files to commit'}
          rows={3}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doCommit()
          }}
          className="selectable w-full resize-none rounded-md bg-app-bg border border-app-border px-3 py-2 text-[13px] text-app-text outline-none focus:border-app-accent"
        />
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-1.5 text-[12px] text-app-muted cursor-pointer no-drag">
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
            Amend (edit last commit)
          </label>
          <Button variant="primary" onClick={doCommit} disabled={!canCommit}>
            <Check size={15} /> Commit {stagedCount > 0 ? `(${stagedCount})` : ''}
          </Button>
        </div>
      </div>

      {confirmDiscard && (
        <ConfirmModal
          title="Discard changes"
          message={`Discard changes to "${confirmDiscard.path}"? This cannot be undone.`}
          danger
          confirmText="Discard changes"
          onConfirm={() => discard(confirmDiscard)}
          onClose={() => setConfirmDiscard(null)}
        />
      )}
    </div>
  )
}

function ChangeRow({
  file,
  active,
  onClick,
  actions
}: {
  file: FileChange
  active: boolean
  onClick: () => void
  actions: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-1 text-[12px] cursor-pointer ${
        active ? 'bg-app-accent/15' : 'hover:bg-app-hover'
      }`}
    >
      <FileStatusBadge status={file.kind} />
      <span className="truncate flex-1 text-app-text" title={file.path}>
        {file.path}
      </span>
      <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">{actions}</span>
    </div>
  )
}

function RowAction({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="w-6 h-6 inline-flex items-center justify-center rounded text-app-muted hover:text-app-text hover:bg-app-hover"
    >
      {children}
    </button>
  )
}

function ListHeader({ title, action }: { title: string; action: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] uppercase tracking-wide text-app-muted bg-app-panel/60 sticky top-0">
      <span>{title}</span>
      {action}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-3 py-2 text-[11px] text-app-muted italic">{children}</div>
}
