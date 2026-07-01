import React, { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  RefreshCw,
  GitBranch,
  Archive,
  ArchiveRestore,
  GitMerge,
  PanelLeft,
  Undo2
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button, IconButton } from './ui'
import { PromptModal, ConfirmModal } from './PromptModal'

export function Toolbar(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const repo = useStore((s) => s.repo)
  const busy = useStore((s) => s.busy)
  const fetch = useStore((s) => s.fetch)
  const pull = useStore((s) => s.pull)
  const push = useStore((s) => s.push)
  const createBranch = useStore((s) => s.createBranch)
  const stashSave = useStore((s) => s.stashSave)
  const stashPop = useStore((s) => s.stashPop)
  const stashes = useStore((s) => s.stashes)
  const selection = useStore((s) => s.selection)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const pushRejected = useStore((s) => s.pushRejected)
  const dismissPushRejected = useStore((s) => s.dismissPushRejected)
  const undoInfo = useStore((s) => s.undoInfo)
  const undoLastAction = useStore((s) => s.undoLastAction)

  const [branchModal, setBranchModal] = useState(false)
  const [undoModal, setUndoModal] = useState(false)

  const ahead = status?.ahead ?? 0
  const behind = status?.behind ?? 0
  const hasUpstream = !!status?.tracking
  const dirty = status && !status.isClean

  // Pop is enabled only when the currently selected commit is a stash (WIP).
  const selectedStash =
    selection?.type === 'commit' ? stashes.find((s) => s.hash === selection.hash) ?? null : null

  const doPush = (): void => {
    if (hasUpstream) push({})
    else push({ remote: 'origin', branch: repo?.currentBranch, setUpstream: true })
  }

  return (
    <div className="flex items-center gap-1 h-12 px-3 bg-app-panel border-b border-app-border shrink-0">
      <IconButton
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        onClick={toggleSidebar}
        className={sidebarOpen ? 'text-app-accent' : ''}
      >
        <PanelLeft size={16} />
      </IconButton>
      <div className="w-px h-6 bg-app-border mx-1.5" />
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
        onClick={() => stashSave('WIP')}
        disabled={busy || !dirty}
        title="Stash your changes as a WIP"
      >
        <Archive size={15} /> Stash
      </Button>
      <Button
        variant="ghost"
        onClick={() => selectedStash && stashPop(selectedStash.index)}
        disabled={busy || !selectedStash}
        title={selectedStash ? 'Apply and drop the selected stash' : 'Select a stash (WIP) to pop'}
      >
        <ArchiveRestore size={15} /> Pop
      </Button>

      <div className="w-px h-6 bg-app-border mx-1.5" />

      <IconButton
        title={undoInfo ? `Undo: ${undoInfo.action}` : 'Nothing to undo'}
        onClick={() => setUndoModal(true)}
        disabled={busy || !undoInfo}
      >
        <Undo2 size={16} />
      </IconButton>

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

      {pushRejected && (
        <ConfirmModal
          title="Push rejected — force push?"
          message={
            'The remote branch has different history, usually because you reworded, amended or rebased a commit that was already pushed.\n\n' +
            'Force-push with lease to overwrite the remote branch? It is safely refused if someone else has pushed in the meantime — in that case, pull first.'
          }
          confirmText="Force push"
          danger
          onConfirm={() => push({ ...pushRejected, force: true })}
          onClose={dismissPushRejected}
        />
      )}

      {undoModal && undoInfo && (
        <ConfirmModal
          title="Undo last action"
          message={`This undoes:\n"${undoInfo.action}"\n\n${undoInfo.branch} moves back to ${undoInfo.target} (${undoInfo.subject}).\n\nNothing is lost — it's a soft reset, so your files stay put and an undone commit's changes return as staged.`}
          confirmText="Undo"
          onConfirm={() => undoLastAction()}
          onClose={() => setUndoModal(false)}
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
