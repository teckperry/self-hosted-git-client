import React, { useState } from 'react'
import { ArrowDown, ArrowUp, RefreshCw, GitBranch, Archive, GitMerge } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button } from './ui'
import { PromptModal } from './PromptModal'

export function Toolbar(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const repo = useStore((s) => s.repo)
  const busy = useStore((s) => s.busy)
  const fetch = useStore((s) => s.fetch)
  const pull = useStore((s) => s.pull)
  const push = useStore((s) => s.push)
  const createBranch = useStore((s) => s.createBranch)
  const stashSave = useStore((s) => s.stashSave)

  const [branchModal, setBranchModal] = useState(false)
  const [stashModal, setStashModal] = useState(false)

  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const hasUpstream = !!status?.tracking
  const dirty = status && !status.isClean

  const doPush = (): void => {
    if (hasUpstream) push({})
    else push({ remote: 'origin', branch: repo?.currentBranch, setUpstream: true })
  }

  return (
    <div className="flex items-center gap-1 h-12 px-3 bg-app-panel border-b border-app-border shrink-0">
      <Button variant="ghost" onClick={() => fetch()} disabled={busy} title="Fetch remote refs">
        <RefreshCw size={15} /> Fetch
      </Button>
      <Button
        variant="ghost"
        onClick={() => pull()}
        disabled={busy || !hasUpstream}
        title="Pull (fetch + merge)"
      >
        <ArrowDown size={15} /> Pull
        {behind > 0 && <Counter>{behind}</Counter>}
      </Button>
      <Button variant="ghost" onClick={doPush} disabled={busy} title="Push">
        <ArrowUp size={15} /> Push
        {ahead > 0 && <Counter>{ahead}</Counter>}
        {!hasUpstream && <span className="text-[10px] text-app-warning ml-1">(set upstream)</span>}
      </Button>

      <div className="w-px h-6 bg-app-border mx-1.5" />

      <Button variant="ghost" onClick={() => setBranchModal(true)} disabled={busy}>
        <GitBranch size={15} /> Branch
      </Button>
      <Button
        variant="ghost"
        onClick={() => setStashModal(true)}
        disabled={busy || !dirty}
        title="Stash your changes"
      >
        <Archive size={15} /> Stash
      </Button>

      <div className="flex-1" />

      {status && (
        <div className="flex items-center gap-3 text-[12px] text-app-muted pr-1">
          <span className="flex items-center gap-1">
            <GitMerge size={13} className="text-app-accent" />
            {status.current || '—'}
          </span>
          {hasUpstream && (
            <span title="relative to upstream branch">
              ↑{ahead} ↓{behind}
            </span>
          )}
        </div>
      )}

      {branchModal && (
        <PromptModal
          title="New branch"
          label="Name of the new branch (created from the current commit)"
          placeholder="feature/new-feature"
          confirmText="Create and checkout"
          onConfirm={(name) => createBranch(name, true)}
          onClose={() => setBranchModal(false)}
        />
      )}
      {stashModal && (
        <PromptModal
          title="Create stash"
          label="Message (optional)"
          placeholder="work in progress"
          confirmText="Save stash"
          onConfirm={(msg) => stashSave(msg)}
          onClose={() => setStashModal(false)}
        />
      )}
    </div>
  )
}

function Counter({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span className="ml-1 px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-app-accent text-app-accent-fg text-[10px] font-semibold">
      {children}
    </span>
  )
}
