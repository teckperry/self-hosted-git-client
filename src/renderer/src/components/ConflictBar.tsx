import React from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button } from './ui'

/**
 * A slim banner shown while a merge / rebase / cherry-pick / revert is
 * mid-flight, with the operation-wide continue / abort controls. The individual
 * conflicted files are resolved from the right sidebar (highlighted rows that
 * open the merge editor), so this bar stays out of the way.
 */
export function ConflictBar(): React.JSX.Element | null {
  const mergeState = useStore((s) => s.mergeState)
  const busy = useStore((s) => s.busy)
  const abortOperation = useStore((s) => s.abortOperation)
  const continueOperation = useStore((s) => s.continueOperation)

  if (!mergeState?.operation) return null
  const { operation, conflicted } = mergeState
  const done = conflicted.length === 0

  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-9 bg-app-warning/10 border-b border-app-warning/40">
      <AlertTriangle size={15} className="text-app-warning shrink-0" />
      <span className="text-[13px] text-app-text font-medium capitalize">{operation} in progress</span>
      <span className="text-[12px] text-app-muted">
        {done
          ? 'all conflicts resolved — continue to finish'
          : `${conflicted.length} conflicted file${conflicted.length === 1 ? '' : 's'} — resolve them in the right panel`}
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
  )
}
