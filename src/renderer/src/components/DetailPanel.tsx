import React, { useMemo } from 'react'
import { GitCommit, Copy } from 'lucide-react'
import { useStore } from '../store/useStore'
import { fullDate, initials, colorFromString } from '../lib/format'
import { DiffViewer } from './DiffViewer'
import { FileStatusBadge } from './FileStatusBadge'
import type { DiffFile } from '@shared/types'

export function DetailPanel(): React.JSX.Element {
  const selection = useStore((s) => s.selection)
  const commits = useStore((s) => s.commits)
  const commitDiff = useStore((s) => s.commitDiff)
  const selectedFilePath = useStore((s) => s.selectedFilePath)
  const selectCommitFile = useStore((s) => s.selectCommitFile)
  const loadingDiff = useStore((s) => s.loadingDiff)

  const commit = useMemo(
    () => (selection?.type === 'commit' ? commits.find((c) => c.hash === selection.hash) : undefined),
    [selection, commits]
  )

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
            <div className="text-app-text font-semibold leading-snug selectable">{commit.subject}</div>
            <div className="text-app-muted text-[12px] mt-0.5">
              <span className="text-app-text">{commit.author}</span>{' '}
              <span className="selectable">{`<${commit.authorEmail}>`}</span> · {fullDate(commit.date)}
            </div>
          </div>
          <button
            title="Copy SHA"
            onClick={() => navigator.clipboard.writeText(commit.hash)}
            className="flex items-center gap-1 font-mono text-[11px] text-app-muted hover:text-app-text shrink-0"
          >
            {commit.shortHash} <Copy size={12} />
          </button>
        </div>
        {commit.body && (
          <pre className="mt-2 text-[12px] text-app-text/90 whitespace-pre-wrap break-words selectable font-sans">
            {commit.body}
          </pre>
        )}
      </div>

      {/* file list */}
      <div className="shrink-0 max-h-[38%] overflow-auto border-b border-app-border">
        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-app-muted bg-app-panel/50 sticky top-0">
          {commitDiff.length} changed files
        </div>
        {commitDiff.map((f) => (
          <FileRow
            key={f.newPath || f.oldPath}
            file={f}
            active={f === activeFile}
            onClick={() => selectCommitFile(f.newPath || f.oldPath)}
          />
        ))}
        {commitDiff.length === 0 && !loadingDiff && (
          <div className="px-3 py-3 text-app-muted text-[12px]">No changes in this commit.</div>
        )}
      </div>

      {/* diff */}
      <div className="flex-1 min-h-0">
        <DiffViewer file={activeFile} loading={loadingDiff && !activeFile} />
      </div>
    </div>
  )
}

function FileRow({
  file,
  active,
  onClick
}: {
  file: DiffFile
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
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
