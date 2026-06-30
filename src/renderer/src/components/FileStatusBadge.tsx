import React from 'react'

const MAP: Record<string, { letter: string; cls: string; title: string }> = {
  modified: { letter: 'M', cls: 'text-app-warning border-app-warning/50', title: 'Modified' },
  added: { letter: 'A', cls: 'text-app-success border-app-success/50', title: 'Added' },
  deleted: { letter: 'D', cls: 'text-app-danger border-app-danger/50', title: 'Deleted' },
  renamed: { letter: 'R', cls: 'text-app-accent border-app-accent/50', title: 'Renamed' },
  copied: { letter: 'C', cls: 'text-app-accent border-app-accent/50', title: 'Copied' },
  untracked: { letter: '?', cls: 'text-app-muted border-app-border', title: 'Untracked' },
  conflicted: { letter: 'U', cls: 'text-app-danger border-app-danger/50', title: 'Conflicted' }
}

export function FileStatusBadge({ status }: { status: string }): React.JSX.Element {
  const m = MAP[status] ?? MAP.modified
  return (
    <span
      title={m.title}
      className={`inline-flex items-center justify-center w-4 h-4 rounded border text-[10px] font-bold shrink-0 ${m.cls}`}
    >
      {m.letter}
    </span>
  )
}
