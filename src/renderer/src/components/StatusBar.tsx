import React from 'react'
import { GitBranch, FolderGit2 } from 'lucide-react'
import { useStore } from '../store/useStore'

export function StatusBar(): React.JSX.Element {
  const repo = useStore((s) => s.repo)
  const status = useStore((s) => s.status)
  const busy = useStore((s) => s.busy)
  const busyLabel = useStore((s) => s.busyLabel)
  const commits = useStore((s) => s.commits)

  const changeCount = status ? status.staged.length + status.unstaged.length : 0

  return (
    <footer className="flex items-center gap-3 h-6 px-3 bg-app-panel border-t border-app-border text-[11px] text-app-muted shrink-0">
      {repo && (
        <>
          <span className="flex items-center gap-1">
            <FolderGit2 size={12} /> {repo.name}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch size={12} /> {repo.isDetached ? `detached @ ${repo.currentBranch}` : repo.currentBranch}
          </span>
          {status && (status.ahead > 0 || status.behind > 0) && (
            <span>
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
          <span>{changeCount} changes</span>
          <span>{commits.length} commits loaded</span>
        </>
      )}
      <div className="flex-1" />
      {busy && <span className="text-app-accent">{busyLabel}</span>}
    </footer>
  )
}
