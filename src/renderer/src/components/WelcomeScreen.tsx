import React, { useEffect, useState } from 'react'
import { FolderOpen, GitBranch, Download, Plus, Clock, X, KeyRound } from 'lucide-react'
import { useStore } from '../store/useStore'
import { branding } from '../branding'
import { Button, Input, Spinner } from './ui'

export function WelcomeScreen({ onOpenSsh }: { onOpenSsh: () => void }): React.JSX.Element {
  const recentRepos = useStore((s) => s.recentRepos)
  const loadRecent = useStore((s) => s.loadRecent)
  const pickAndOpenRepo = useStore((s) => s.pickAndOpenRepo)
  const pickAndCloneRepo = useStore((s) => s.pickAndCloneRepo)
  const pickAndInitRepo = useStore((s) => s.pickAndInitRepo)
  const openRepoByPath = useStore((s) => s.openRepoByPath)
  const removeRecent = useStore((s) => s.removeRecent)
  const loadingRepo = useStore((s) => s.loadingRepo)
  const busyLabel = useStore((s) => s.busyLabel)

  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  return (
    <div className="h-full flex flex-col items-center justify-center bg-app-bg overflow-auto">
      <div className="w-full max-w-2xl px-8 py-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl bg-app-accent flex items-center justify-center">
            <GitBranch size={24} className="text-app-accent-fg" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-app-text leading-tight">{branding.name}</h1>
            <p className="text-app-muted text-[13px]">{branding.tagline}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-8">
          <ActionCard
            icon={<FolderOpen size={20} />}
            title="Open"
            subtitle="Local repository"
            onClick={pickAndOpenRepo}
          />
          <ActionCard
            icon={<Download size={20} />}
            title="Clone"
            subtitle="From remote URL"
            onClick={() => setCloneOpen((v) => !v)}
            active={cloneOpen}
          />
          <ActionCard
            icon={<Plus size={20} />}
            title="Initialize"
            subtitle="New repository"
            onClick={pickAndInitRepo}
          />
        </div>

        {cloneOpen && (
          <div className="mt-4 p-4 rounded-lg bg-app-panel border border-app-border">
            <p className="text-[12px] text-app-muted mb-2">
              Enter the repository URL (HTTPS or SSH), then choose the destination folder.
            </p>
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="git@example.com:user/repo.git"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cloneUrl.trim()) pickAndCloneRepo(cloneUrl.trim())
                }}
              />
              <Button
                variant="primary"
                disabled={!cloneUrl.trim() || loadingRepo}
                onClick={() => pickAndCloneRepo(cloneUrl.trim())}
              >
                {loadingRepo ? <Spinner /> : 'Clone'}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-app-muted">
              <Clock size={13} /> Recent
            </h2>
            <button
              onClick={onOpenSsh}
              className="no-drag flex items-center gap-1.5 text-[12px] text-app-muted hover:text-app-text"
            >
              <KeyRound size={13} /> SSH keys
            </button>
          </div>
          {recentRepos.length === 0 ? (
            <p className="text-app-muted text-[13px] py-4 text-center">
              No recent repositories. Open or clone a repository to get started.
            </p>
          ) : (
            <ul className="rounded-lg border border-app-border overflow-hidden divide-y divide-app-border">
              {recentRepos.map((r) => (
                <li
                  key={r.path}
                  className="group flex items-center gap-3 px-3 py-2.5 hover:bg-app-hover cursor-pointer"
                  onClick={() => openRepoByPath(r.path)}
                >
                  <GitBranch size={16} className="text-app-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-app-text font-medium truncate">{r.name}</div>
                    <div className="text-app-muted text-[11px] truncate">{r.path}</div>
                  </div>
                  <button
                    title="Remove from recent"
                    className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-app-danger p-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecent(r.path)
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {loadingRepo && (
          <div className="mt-6 flex items-center gap-2 text-app-muted text-[13px]">
            <Spinner /> {busyLabel || 'Opening…'}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
  active
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
  active?: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`no-drag flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-colors ${
        active
          ? 'border-app-accent bg-app-panel'
          : 'border-app-border bg-app-panel hover:bg-app-hover'
      }`}
    >
      <span className="text-app-accent">{icon}</span>
      <span>
        <span className="block text-app-text font-semibold">{title}</span>
        <span className="block text-app-muted text-[12px]">{subtitle}</span>
      </span>
    </button>
  )
}
