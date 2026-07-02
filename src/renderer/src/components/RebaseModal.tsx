import React, { useEffect, useMemo, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, call } from '../lib/ipc'
import { Modal, Button, Spinner } from './ui'
import type { RebaseAction, RebaseTodoItem } from '@shared/types'

interface Item {
  hash: string
  shortHash: string
  subject: string
  action: RebaseAction
}

const ACTIONS: { value: RebaseAction; label: string }[] = [
  { value: 'pick', label: 'pick' },
  { value: 'squash', label: 'squash ↓' },
  { value: 'fixup', label: 'fixup ↓' },
  { value: 'drop', label: 'drop' }
]

/**
 * Interactive-rebase planner for the commits above `onto` (onto..HEAD). Commits
 * are listed newest-first; reorder them and choose an action each. "squash ↓" /
 * "fixup ↓" fold a commit into the one below it (its older neighbour). Starting
 * runs the rebase; any conflicts are handled by the merge editor.
 */
export function RebaseModal({
  onto,
  ontoShort,
  onClose
}: {
  onto: string
  ontoShort: string
  onClose: () => void
}): React.JSX.Element {
  const repoPath = useStore((s) => s.repo?.path)
  const busy = useStore((s) => s.busy)
  const rebaseInteractive = useStore((s) => s.rebaseInteractive)

  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    if (!repoPath) return
    let alive = true
    call(api.getRebaseCommits(repoPath, onto))
      .then((commits) => {
        if (!alive) return
        // Newest first for display (git applies the reverse, oldest first).
        setItems([...commits].reverse().map((c) => ({ ...c, action: 'pick' as RebaseAction })))
      })
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [repoPath, onto])

  const move = (i: number, dir: -1 | 1): void => {
    setItems((prev) => {
      if (!prev) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  const setAction = (i: number, action: RebaseAction): void =>
    setItems((prev) => (prev ? prev.map((it, k) => (k === i ? { ...it, action } : it)) : prev))

  // git todo is oldest-first = the display list reversed.
  const todo: RebaseTodoItem[] = useMemo(
    () => (items ? [...items].reverse().map((it) => ({ action: it.action, hash: it.hash })) : []),
    [items]
  )
  const kept = todo.filter((t) => t.action !== 'drop')
  const firstNotPick = kept.length > 0 && kept[0].action !== 'pick'
  const canStart = !!items && items.length > 0 && kept.length > 0 && !firstNotPick && !busy

  const start = async (): Promise<void> => {
    if (!canStart) return
    await rebaseInteractive(onto, todo)
    onClose()
  }

  return (
    <Modal title="Interactive rebase" onClose={onClose} width={620}>
      <p className="text-[12px] text-app-muted mb-2">
        Replaying the commits after{' '}
        <span className="font-mono text-app-text">{ontoShort}</span>. Reorder with the arrows and
        pick an action. <span className="text-app-text">squash/fixup ↓</span> fold a commit into the
        one below it.
      </p>

      {items === null ? (
        <div className="flex items-center justify-center py-8 text-app-muted text-[13px]">
          <Spinner /> <span className="ml-2">Loading commits…</span>
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-app-muted">
          No commits above {ontoShort} to rebase.
        </p>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-md border border-app-border">
          {items.map((it, i) => (
            <div
              key={it.hash}
              className={`flex items-center gap-2 px-2 py-1 text-[12px] border-b border-app-border last:border-b-0 ${
                it.action === 'drop' ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-app-muted hover:text-app-text disabled:opacity-30"
                  title="Move up (later)"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="text-app-muted hover:text-app-text disabled:opacity-30"
                  title="Move down (earlier)"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
              <select
                value={it.action}
                onChange={(e) => setAction(i, e.target.value as RebaseAction)}
                className="no-drag h-7 rounded bg-app-bg border border-app-border text-app-text text-[12px] px-1 outline-none focus:border-app-accent"
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <span className="font-mono text-app-muted shrink-0">{it.shortHash}</span>
              <span className="truncate flex-1 text-app-text" title={it.subject}>
                {it.subject}
              </span>
            </div>
          ))}
        </div>
      )}

      {firstNotPick && (
        <p className="text-[11px] text-app-warning mt-2">
          The oldest kept commit can&apos;t be squash/fixup — set it to pick.
        </p>
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="text-[11px] text-app-muted">
          Rewrites history on this branch. Conflicts open the merge editor.
        </span>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void start()} disabled={!canStart}>
            Start rebase
          </Button>
        </div>
      </div>
    </Modal>
  )
}
