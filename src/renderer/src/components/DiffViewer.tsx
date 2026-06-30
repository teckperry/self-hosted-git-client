import React from 'react'
import { FileText } from 'lucide-react'
import { Spinner } from './ui'
import type { DiffFile, DiffLine } from '@shared/types'

export function DiffViewer({
  file,
  loading
}: {
  file: DiffFile | null
  loading?: boolean
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
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 h-8 bg-app-panel border-b border-app-border">
        <span className="text-app-text truncate">{filePathLabel(file)}</span>
        <span className="text-app-success">+{file.additions}</span>
        <span className="text-app-danger">−{file.deletions}</span>
      </div>
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
                <DiffRow key={`${hi}-${li}`} line={line} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }): React.JSX.Element {
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

function filePathLabel(file: DiffFile): string {
  if (file.status === 'renamed' && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`
  }
  return file.newPath || file.oldPath
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-app-muted text-[13px] text-center px-4">
      {children}
    </div>
  )
}
