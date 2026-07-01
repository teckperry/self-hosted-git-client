import React, { useEffect, useMemo, useRef } from 'react'
import type { DiffFile, DiffLine } from '@shared/types'

interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

/** Pair up deletions (left) with additions (right); context lines span both. */
function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: DiffLine[] = []
  let adds: DiffLine[] = []
  const flush = (): void => {
    const n = Math.max(dels.length, adds.length)
    for (let i = 0; i < n; i++) rows.push({ left: dels[i] ?? null, right: adds[i] ?? null })
    dels = []
    adds = []
  }
  for (const line of lines) {
    if (line.type === 'del') dels.push(line)
    else if (line.type === 'add') adds.push(line)
    else {
      flush()
      rows.push({ left: line, right: line })
    }
  }
  flush()
  return rows
}

/**
 * Side-by-side diff as two panes whose scroll is fully synced — both vertically
 * (rows always line up) and horizontally (the bar moves both sides together so
 * you compare the same columns). The left pane is the primary scroller (shared
 * with the minimap). A guard breaks the feedback loop when the two sides have
 * different widths and the mirrored scrollLeft gets clamped.
 */
export function SplitDiffView({
  file,
  primaryRef
}: {
  file: DiffFile
  primaryRef: React.RefObject<HTMLDivElement>
}): React.JSX.Element {
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const hunks = useMemo(
    () => file.hunks.map((h) => ({ header: h.header, rows: toSplitRows(h.lines) })),
    [file]
  )

  // Mirror the scrolled pane onto the other on both axes. The guard ignores the
  // mirrored pane's own scroll event so the two don't fight when clamped.
  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null): void => {
    if (syncing.current || !from || !to) return
    syncing.current = true
    to.scrollTop = from.scrollTop
    to.scrollLeft = from.scrollLeft
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }

  useEffect(() => {
    for (const el of [primaryRef.current, rightRef.current]) {
      if (el) {
        el.scrollTop = 0
        el.scrollLeft = 0
      }
    }
  }, [file, primaryRef])

  return (
    <div className="flex-1 min-w-0 flex">
      <div
        ref={primaryRef}
        onScroll={() => mirror(primaryRef.current, rightRef.current)}
        className="flex-1 min-w-0 overflow-auto border-r border-app-border"
      >
        <Side hunks={hunks} side="left" />
      </div>
      <div
        ref={rightRef}
        onScroll={() => mirror(rightRef.current, primaryRef.current)}
        className="flex-1 min-w-0 overflow-auto"
      >
        <Side hunks={hunks} side="right" />
      </div>
    </div>
  )
}

function Side({
  hunks,
  side
}: {
  hunks: { header: string; rows: SplitRow[] }[]
  side: 'left' | 'right'
}): React.JSX.Element {
  return (
    <div className="min-w-full w-max font-mono text-[12px] leading-[1.5]">
      <table className="w-full border-collapse">
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
        </colgroup>
        <tbody>
          {hunks.map((h, hi) => (
            <React.Fragment key={hi}>
              <tr className="bg-app-panel-2/60">
                <td colSpan={2} className="px-3 py-0.5 text-app-muted whitespace-pre">
                  {h.header}
                </td>
              </tr>
              {h.rows.map((row, ri) => (
                <SideRow key={ri} line={side === 'left' ? row.left : row.right} side={side} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SideRow({ line, side }: { line: DiffLine | null; side: 'left' | 'right' }): React.JSX.Element {
  const num = line ? (side === 'left' ? line.oldLine : line.newLine) : null
  let bg = ''
  if (!line) bg = 'bg-app-panel-2/30'
  else if (line.type === 'del') bg = 'bg-app-danger/10'
  else if (line.type === 'add') bg = 'bg-app-success/10'
  return (
    <tr>
      <td className={`w-11 px-2 text-right text-app-muted/60 select-none align-top ${bg}`}>
        {num ?? ''}
      </td>
      <td className={`pl-2 pr-3 whitespace-pre selectable align-top ${bg}`}>
        <span className="text-app-text">{line && line.content !== '' ? line.content : ' '}</span>
      </td>
    </tr>
  )
}
