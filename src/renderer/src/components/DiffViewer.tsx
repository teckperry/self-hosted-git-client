import React from 'react'
import { FileText } from 'lucide-react'
import { Spinner } from './ui'
import type { DiffFile, DiffLine } from '@shared/types'
import type { DiffViewMode } from '../store/useStore'

export function DiffViewer({
  file,
  loading,
  mode = 'inline'
}: {
  file: DiffFile | null
  loading?: boolean
  mode?: DiffViewMode
}): React.JSX.Element {
  if (loading) {
    return (
      <Centered>
        <Spinner /> <span className="ml-2">Loading diff…</span>
      </Centered>
    )
  }
  if (!file) {
    return (
      <Centered>
        <FileText size={28} className="mb-2 opacity-50" />
        Select a file to view its changes
      </Centered>
    )
  }
  if (file.isBinary) {
    return <Centered>Binary file — diff not available</Centered>
  }
  if (file.hunks.length === 0) {
    return <Centered>No textual differences</Centered>
  }

  return (
    <div className="h-full overflow-auto bg-app-bg font-mono text-[12px] leading-[1.5]">
      {mode === 'split' ? <SplitView file={file} /> : <InlineView file={file} />}
    </div>
  )
}

// --- inline (single column) -------------------------------------------------

function InlineView({ file }: { file: DiffFile }): React.JSX.Element {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {file.hunks.map((hunk, hi) => (
          <React.Fragment key={hi}>
            <tr className="bg-app-panel-2/60">
              <td className="w-[1%] select-none" />
              <td className="w-[1%] select-none" />
              <td className="px-3 py-0.5 text-app-muted whitespace-pre">{hunk.header}</td>
            </tr>
            {hunk.lines.map((line, li) => (
              <InlineRow key={`${hi}-${li}`} line={line} />
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

function InlineRow({ line }: { line: DiffLine }): React.JSX.Element {
  const bg =
    line.type === 'add'
      ? 'bg-app-success/10'
      : line.type === 'del'
        ? 'bg-app-danger/10'
        : ''
  const marker = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
  const markerColor =
    line.type === 'add' ? 'text-app-success' : line.type === 'del' ? 'text-app-danger' : 'text-app-muted'
  return (
    <tr className={bg}>
      <td className="w-12 px-2 text-right text-app-muted/60 select-none align-top">
        {line.oldLine ?? ''}
      </td>
      <td className="w-12 px-2 text-right text-app-muted/60 select-none align-top border-r border-app-border">
        {line.newLine ?? ''}
      </td>
      <td className="pl-2 pr-3 whitespace-pre-wrap break-all selectable">
        <span className={`select-none ${markerColor}`}>{marker} </span>
        <span className="text-app-text">{line.content}</span>
      </td>
    </tr>
  )
}

// --- split (side by side) ---------------------------------------------------

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

function SplitView({ file }: { file: DiffFile }): React.JSX.Element {
  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        <col style={{ width: 44 }} />
        <col />
        <col style={{ width: 44 }} />
        <col />
      </colgroup>
      <tbody>
        {file.hunks.map((hunk, hi) => (
          <React.Fragment key={hi}>
            <tr className="bg-app-panel-2/60">
              <td colSpan={4} className="px-3 py-0.5 text-app-muted whitespace-pre">
                {hunk.header}
              </td>
            </tr>
            {toSplitRows(hunk.lines).map((row, ri) => (
              <SplitRowView key={`${hi}-${ri}`} row={row} />
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  )
}

function SplitRowView({ row }: { row: SplitRow }): React.JSX.Element {
  return (
    <tr>
      <SplitCell line={row.left} side="left" />
      <SplitCell line={row.right} side="right" />
    </tr>
  )
}

/** Renders the line-number cell + content cell for one side of a split row. */
function SplitCell({ line, side }: { line: DiffLine | null; side: 'left' | 'right' }): React.JSX.Element {
  const num = line ? (side === 'left' ? line.oldLine : line.newLine) : null
  let bg = ''
  if (!line) bg = 'bg-app-panel-2/30'
  else if (line.type === 'del') bg = 'bg-app-danger/10'
  else if (line.type === 'add') bg = 'bg-app-success/10'
  return (
    <>
      <td className={`px-2 text-right text-app-muted/60 select-none align-top ${bg}`}>
        {num ?? ''}
      </td>
      <td className={`pl-2 pr-3 whitespace-pre-wrap break-all selectable align-top border-r border-app-border ${bg}`}>
        <span className="text-app-text">{line?.content ?? ''}</span>
      </td>
    </>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-muted text-[13px] text-center px-4">
      {children}
    </div>
  )
}
