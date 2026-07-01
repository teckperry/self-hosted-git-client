import React from 'react'
import { FileText } from 'lucide-react'
import { Spinner } from './ui'
import type { DiffFile, DiffLine } from '@shared/types'

/**
 * Inline (single-column) diff renderer plus the loading/empty/binary states.
 * It has no scroll container of its own — the DiffEditor wraps it in one that
 * scrolls vertically and horizontally (lines don't wrap). Split view lives in
 * SplitDiffView.
 */
export function DiffViewer({
  file,
  loading,
  searchQuery = ''
}: {
  file: DiffFile | null
  loading?: boolean
  /** in-editor code search: lines not containing it are dimmed */
  searchQuery?: string
}): React.JSX.Element {
  const q = searchQuery.trim().toLowerCase()
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

  // Grows to its widest line (w-max) so long lines scroll horizontally.
  return (
    <div className="font-mono text-[12px] leading-[1.5] min-w-full w-max">
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
                <InlineRow
                  key={`${hi}-${li}`}
                  line={line}
                  dimmed={q !== '' && !line.content.toLowerCase().includes(q)}
                />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InlineRow({ line, dimmed }: { line: DiffLine; dimmed: boolean }): React.JSX.Element {
  const bg =
    line.type === 'add' ? 'bg-app-success/10' : line.type === 'del' ? 'bg-app-danger/10' : ''
  const marker = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
  const markerColor =
    line.type === 'add'
      ? 'text-app-success'
      : line.type === 'del'
        ? 'text-app-danger'
        : 'text-app-muted'
  return (
    <tr className={`${bg} ${dimmed ? 'opacity-25' : ''}`}>
      <td className="w-12 px-2 text-right text-app-muted/60 select-none align-top">
        {line.oldLine ?? ''}
      </td>
      <td className="w-12 px-2 text-right text-app-muted/60 select-none align-top border-r border-app-border">
        {line.newLine ?? ''}
      </td>
      <td className="pl-2 pr-3 whitespace-pre selectable">
        <span className={`select-none ${markerColor}`}>{marker} </span>
        <span className="text-app-text">{line.content}</span>
      </td>
    </tr>
  )
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-muted text-[13px] text-center px-4">
      {children}
    </div>
  )
}
