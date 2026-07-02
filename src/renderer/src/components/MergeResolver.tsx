import React, { useEffect, useMemo, useState } from 'react'
import { X, Check, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, call } from '../lib/ipc'
import { Button, Spinner } from './ui'
import {
  parseConflicts,
  conflictCount,
  assembleResult,
  type MergePart,
  type Choice
} from '../lib/conflicts'

/**
 * Three-pane merge editor for a single conflicted file: OURS (left) and THEIRS
 * (right) on top, the assembled RESULT below. Each conflict hunk is toggled per
 * side — click the blocks you want to keep (ours, theirs, or both) and the
 * result updates live. Saving writes the file and stages it.
 */
export function MergeResolver({
  file,
  onClose
}: {
  file: string
  onClose: () => void
}): React.JSX.Element {
  const repoPath = useStore((s) => s.repo?.path)
  const busy = useStore((s) => s.busy)
  const resolveConflictWith = useStore((s) => s.resolveConflictWith)

  const [parts, setParts] = useState<MergePart[] | null>(null)
  const [choices, setChoices] = useState<Choice[]>([])

  useEffect(() => {
    if (!repoPath) return
    let alive = true
    call(api.readConflictText(repoPath, file))
      .then((text) => {
        if (!alive) return
        const p = parseConflicts(text)
        setParts(p)
        setChoices(Array.from({ length: conflictCount(p) }, () => ({ ours: false, theirs: false })))
      })
      .catch(() => alive && setParts([]))
    return () => {
      alive = false
    }
  }, [repoPath, file])

  const result = useMemo(
    () => (parts ? assembleResult(parts, choices) : { text: '', unresolved: 0 }),
    [parts, choices]
  )
  const total = choices.length
  const toggle = (ci: number, side: 'ours' | 'theirs'): void =>
    setChoices((prev) => prev.map((c, i) => (i === ci ? { ...c, [side]: !c[side] } : c)))

  const save = async (): Promise<void> => {
    if (!parts || result.unresolved > 0) return
    await resolveConflictWith(file, result.text)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      {/* toolbar */}
      <div className="shrink-0 flex items-center gap-3 h-10 px-3 bg-app-panel border-b border-app-border">
        <AlertTriangle size={15} className="text-app-warning shrink-0" />
        <span className="truncate text-[13px] text-app-text font-medium" title={file}>
          {file}
        </span>
        <span className="text-[12px] text-app-muted shrink-0">
          {total} conflict{total === 1 ? '' : 's'}
          {result.unresolved > 0 ? ` · ${result.unresolved} unresolved` : ' · all resolved'}
        </span>
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !parts || result.unresolved > 0}
          title={result.unresolved > 0 ? 'Pick a side for every conflict first' : 'Save and stage'}
        >
          <Check size={14} /> Save resolution
        </Button>
        <Button onClick={onClose}>
          <X size={14} /> Cancel
        </Button>
      </div>

      {parts === null ? (
        <div className="flex-1 flex items-center justify-center text-app-muted text-[13px]">
          <Spinner /> <span className="ml-2">Loading conflict…</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* top: ours | theirs */}
          <div className="flex-1 min-h-0 flex">
            <SidePane
              title="Ours (current)"
              side="ours"
              parts={parts}
              choices={choices}
              onToggle={toggle}
            />
            <div className="w-px bg-app-border shrink-0" />
            <SidePane
              title="Theirs (incoming)"
              side="theirs"
              parts={parts}
              choices={choices}
              onToggle={toggle}
            />
          </div>
          {/* bottom: result */}
          <div className="h-[38%] min-h-[120px] border-t border-app-border flex flex-col">
            <PaneHeader label="Result" />
            <ResultPane parts={parts} choices={choices} />
          </div>
        </div>
      )}
    </div>
  )
}

function PaneHeader({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="shrink-0 px-3 py-1 text-[11px] uppercase tracking-wide text-app-muted bg-app-panel/60 border-b border-app-border">
      {label}
    </div>
  )
}

function SidePane({
  title,
  side,
  parts,
  choices,
  onToggle
}: {
  title: string
  side: 'ours' | 'theirs'
  parts: MergePart[]
  choices: Choice[]
  onToggle: (ci: number, side: 'ours' | 'theirs') => void
}): React.JSX.Element {
  // Literal class strings per side (Tailwind can't see dynamically-built names).
  const st =
    side === 'ours'
      ? {
          chosen: 'bg-app-success/15 border-app-success/50',
          unchosen: 'bg-app-success/5 border-transparent hover:bg-app-success/10 opacity-60',
          label: 'text-app-success',
          box: 'border-app-success',
          boxChosen: 'bg-app-success text-app-accent-fg'
        }
      : {
          chosen: 'bg-app-accent/15 border-app-accent/50',
          unchosen: 'bg-app-accent/5 border-transparent hover:bg-app-accent/10 opacity-60',
          label: 'text-app-accent',
          box: 'border-app-accent',
          boxChosen: 'bg-app-accent text-app-accent-fg'
        }
  let ci = -1
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <PaneHeader label={title} />
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[1.5]">
        {parts.map((p, pi) => {
          if (p.kind === 'context') {
            return (
              <div key={pi}>
                {p.lines.map((l, li) => (
                  <Row key={li} text={l} />
                ))}
              </div>
            )
          }
          ci++
          const idx = ci
          const lines = side === 'ours' ? p.ours : p.theirs
          const chosen = choices[idx]?.[side] ?? false
          return (
            <button
              key={pi}
              onClick={() => onToggle(idx, side)}
              className={`block w-full text-left border-y transition-colors ${
                chosen ? st.chosen : st.unchosen
              }`}
              title={chosen ? 'Click to remove this side' : 'Click to keep this side'}
            >
              <span
                className={`flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wide ${st.label}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-3 h-3 rounded-[3px] border ${st.box} ${
                    chosen ? st.boxChosen : ''
                  }`}
                >
                  {chosen && <Check size={9} />}
                </span>
                Conflict {idx + 1} — {side === 'ours' ? 'ours' : 'theirs'}
                {lines.length === 0 && ' (empty)'}
              </span>
              {lines.map((l, li) => (
                <Row key={li} text={l} />
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResultPane({
  parts,
  choices
}: {
  parts: MergePart[]
  choices: Choice[]
}): React.JSX.Element {
  let ci = -1
  return (
    <div className="flex-1 overflow-auto font-mono text-[12px] leading-[1.5] bg-app-bg">
      {parts.map((p, pi) => {
        if (p.kind === 'context') {
          return (
            <div key={pi}>
              {p.lines.map((l, li) => (
                <Row key={li} text={l} />
              ))}
            </div>
          )
        }
        ci++
        const ch = choices[ci] ?? { ours: false, theirs: false }
        if (!ch.ours && !ch.theirs) {
          return (
            <div
              key={pi}
              className="px-2 py-0.5 bg-app-warning/15 text-app-warning whitespace-pre"
            >
              {`⚠ Conflict ${ci + 1} — pick a side above`}
            </div>
          )
        }
        const chosen = [...(ch.ours ? p.ours : []), ...(ch.theirs ? p.theirs : [])]
        return (
          <div key={pi} className="bg-app-success/5">
            {chosen.map((l, li) => (
              <Row key={li} text={l} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function Row({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="px-2 whitespace-pre selectable text-app-text/90">{text === '' ? ' ' : text}</div>
  )
}
