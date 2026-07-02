import React, { useState } from 'react'
import { AlertTriangle, Check, X, Columns2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button } from './ui'
import { MergeResolver } from './MergeResolver'

/**
 * A banner shown while a merge / rebase / cherry-pick / revert is mid-flight.
 * Lists the conflicted files with per-file resolution (take ours / theirs /
 * mark resolved) and the operation-wide continue / abort controls. Rendered
 * only when such an operation is in progress.
 */
export function ConflictBar(): React.JSX.Element | null {
  const mergeState = useStore((s) => s.mergeState)
  const busy = useStore((s) => s.busy)
  const resolveConflict = useStore((s) => s.resolveConflict)
  const markConflictResolved = useStore((s) => s.markConflictResolved)
  const abortOperation = useStore((s) => s.abortOperation)
  const continueOperation = useStore((s) => s.continueOperation)
  const [resolving, setResolving] = useState<string | null>(null)

  if (!mergeState?.operation) return null
  const { operation, conflicted } = mergeState
  const done = conflicted.length === 0

  return (
    <div className="shrink-0 bg-app-warning/10 border-b border-app-warning/40">
      <div className="flex items-center gap-2 px-3 h-9">
        <AlertTriangle size={15} className="text-app-warning shrink-0" />
        <span className="text-[13px] text-app-text font-medium capitalize">{operation} in progress</span>
        <span className="text-[12px] text-app-muted">
          {done ? 'all conflicts resolved' : `${conflicted.length} conflicted file${conflicted.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => continueOperation()}
          disabled={busy || !done}
          title={done ? `Finish the ${operation}` : 'Resolve every conflict first'}
        >
          <Check size={14} /> Continue
        </Button>
        <Button
          variant="danger"
          onClick={() => abortOperation()}
          disabled={busy}
          title={`Abort the ${operation} and return to the previous state`}
        >
          <X size={14} /> Abort
        </Button>
      </div>

      {conflicted.length > 0 && (
        <ul className="max-h-40 overflow-auto px-3 pb-2 space-y-1">
          {conflicted.map((file) => (
            <li
              key={file}
              className="flex items-center gap-2 text-[12px] bg-app-panel/60 rounded px-2 py-1"
            >
              <span className="flex-1 truncate font-mono text-app-text" title={file}>
                {file}
              </span>
              <button
                onClick={() => setResolving(file)}
                disabled={busy}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-app-accent/60 text-app-accent hover:bg-app-accent hover:text-app-accent-fg transition-colors disabled:opacity-50"
                title="Open the 3-pane merge editor to pick parts from each side"
              >
                <Columns2 size={12} /> Resolve…
              </button>
              <button
                onClick={() => resolveConflict(file, 'ours')}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-50"
                title="Keep our version (current branch). During a rebase this is the upstream side."
              >
                Use ours
              </button>
              <button
                onClick={() => resolveConflict(file, 'theirs')}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-50"
                title="Take their version (incoming). During a rebase this is your commit's side."
              >
                Use theirs
              </button>
              <button
                onClick={() => markConflictResolved(file)}
                disabled={busy}
                className="px-2 py-0.5 rounded border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-50"
                title="Stage the file as-is (resolve it manually in your editor first)"
              >
                Mark resolved
              </button>
            </li>
          ))}
        </ul>
      )}

      {resolving && <MergeResolver file={resolving} onClose={() => setResolving(null)} />}
    </div>
  )
}
