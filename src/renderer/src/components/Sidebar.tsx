import React, { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  GitBranch,
  Check,
  Cloud,
  Tag as TagIcon,
  Archive,
  FileEdit,
  Server,
  PanelLeftClose
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { ContextMenu, useContextMenu, IconButton, type MenuItem } from './ui'
import { ConfirmModal } from './PromptModal'
import type { Branch } from '@shared/types'

export function Sidebar(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const branches = useStore((s) => s.branches)
  const remotes = useStore((s) => s.remotes)
  const tags = useStore((s) => s.tags)
  const stashes = useStore((s) => s.stashes)
  const selection = useStore((s) => s.selection)
  const selectWip = useStore((s) => s.selectWip)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  const local = branches.filter((b) => !b.isRemote)
  const remote = branches.filter((b) => b.isRemote)
  const changeCount = status ? status.staged.length + status.unstaged.length : 0

  const cm = useContextMenu()
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  return (
    <aside className="w-60 shrink-0 bg-app-panel border-r border-app-border flex flex-col overflow-y-auto select-none">
      <div className="flex items-center justify-between h-9 px-3 border-b border-app-border shrink-0">
        <span className="text-[11px] uppercase tracking-wide text-app-muted">Repository</span>
        <IconButton title="Hide sidebar" onClick={toggleSidebar}>
          <PanelLeftClose size={15} />
        </IconButton>
      </div>
      {/* Working changes */}
      <button
        onClick={selectWip}
        className={`flex items-center gap-2 px-3 h-9 text-left text-[13px] border-b border-app-border ${
          selection?.type === 'wip' ? 'bg-app-accent/15 text-app-text' : 'text-app-text hover:bg-app-hover'
        }`}
      >
        <FileEdit size={15} className="text-app-accent" />
        <span className="flex-1">Working changes</span>
        {changeCount > 0 && (
          <span className="px-1.5 h-[18px] inline-flex items-center rounded-full bg-app-accent text-app-accent-fg text-[10px] font-semibold">
            {changeCount}
          </span>
        )}
      </button>

      <Section title="Local branches" icon={<GitBranch size={13} />} count={local.length}>
        {local.map((b) => (
          <BranchRow key={b.name} branch={b} onMenu={cm.open} setConfirm={setConfirm} />
        ))}
        {local.length === 0 && <Empty>No local branches</Empty>}
      </Section>

      <Section title="Remote branches" icon={<Cloud size={13} />} count={remote.length}>
        {remote.map((b) => (
          <BranchRow key={b.name} branch={b} onMenu={cm.open} setConfirm={setConfirm} remote />
        ))}
        {remote.length === 0 && <Empty>No remote branches</Empty>}
      </Section>

      <Section title="Remotes" icon={<Server size={13} />} count={remotes.length}>
        {remotes.map((r) => (
          <div key={r.name} className="px-3 py-1 text-[12px]">
            <div className="text-app-text">{r.name}</div>
            <div className="text-app-muted text-[11px] truncate">{r.fetch}</div>
          </div>
        ))}
        {remotes.length === 0 && <Empty>No remotes configured</Empty>}
      </Section>

      <Section title="Tags" icon={<TagIcon size={13} />} count={tags.length}>
        {tags.map((t) => (
          <div key={t.name} className="flex items-center gap-2 px-3 py-1 text-[12px] text-app-text">
            <TagIcon size={12} className="text-app-warning" />
            <span className="truncate">{t.name}</span>
          </div>
        ))}
        {tags.length === 0 && <Empty>No tags</Empty>}
      </Section>

      <Section title="Stashes" icon={<Archive size={13} />} count={stashes.length}>
        {stashes.map((s) => (
          <StashRow key={s.index} index={s.index} message={s.message} onMenu={cm.open} setConfirm={setConfirm} />
        ))}
        {stashes.length === 0 && <Empty>No stashes</Empty>}
      </Section>

      {cm.menu && <ContextMenu {...cm.menu} onClose={cm.close} />}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          danger
          confirmText="Delete"
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
    </aside>
  )
}

function BranchRow({
  branch,
  remote,
  onMenu,
  setConfirm
}: {
  branch: Branch
  remote?: boolean
  onMenu: (e: React.MouseEvent, items: MenuItem[]) => void
  setConfirm: (c: { title: string; message: string; onConfirm: () => void }) => void
}): React.JSX.Element {
  const store = useStore.getState
  const display = remote ? branch.name.split('/').slice(1).join('/') : branch.name

  const items: MenuItem[] = remote
    ? [
        { label: 'Checkout (create local branch)', onClick: () => store().checkoutBranch(branch.name, true) },
        { label: 'Merge into current branch', onClick: () => store().mergeBranch(branch.name) }
      ]
    : [
        { label: 'Checkout', onClick: () => store().checkoutBranch(branch.name, false), disabled: branch.current },
        { label: 'Merge into current branch', onClick: () => store().mergeBranch(branch.name), disabled: branch.current },
        { label: '', separator: true, onClick: () => {} },
        {
          label: 'Delete branch',
          danger: true,
          disabled: branch.current,
          onClick: () =>
            setConfirm({
              title: 'Delete branch',
              message: `Delete the branch "${branch.name}"?`,
              onConfirm: () => store().deleteBranch(branch.name, false)
            })
        }
      ]

  return (
    <div
      onDoubleClick={() => store().checkoutBranch(branch.name, !!remote)}
      onContextMenu={(e) => onMenu(e, items)}
      className="group flex items-center gap-2 px-3 py-1 text-[12px] cursor-default hover:bg-app-hover"
      title={remote ? branch.name : undefined}
    >
      {branch.current ? (
        <Check size={12} className="text-app-success shrink-0" />
      ) : (
        <GitBranch size={12} className={`shrink-0 ${remote ? 'text-app-muted' : 'text-app-accent'}`} />
      )}
      <span className={`truncate flex-1 ${branch.current ? 'text-app-text font-semibold' : 'text-app-text'}`}>
        {display}
      </span>
      {(branch.ahead > 0 || branch.behind > 0) && (
        <span className="text-[10px] text-app-muted shrink-0">
          {branch.ahead > 0 && `↑${branch.ahead}`} {branch.behind > 0 && `↓${branch.behind}`}
        </span>
      )}
    </div>
  )
}

function StashRow({
  index,
  message,
  onMenu,
  setConfirm
}: {
  index: number
  message: string
  onMenu: (e: React.MouseEvent, items: MenuItem[]) => void
  setConfirm: (c: { title: string; message: string; onConfirm: () => void }) => void
}): React.JSX.Element {
  const store = useStore.getState
  const items: MenuItem[] = [
    { label: 'Apply (keep stash)', onClick: () => store().stashApply(index) },
    { label: 'Apply and drop (pop)', onClick: () => store().stashPop(index) },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Drop stash',
      danger: true,
      onClick: () =>
        setConfirm({
          title: 'Drop stash',
          message: `Drop stash@{${index}}?`,
          onConfirm: () => store().stashDrop(index)
        })
    }
  ]
  return (
    <div
      onContextMenu={(e) => onMenu(e, items)}
      className="flex items-center gap-2 px-3 py-1 text-[12px] text-app-text hover:bg-app-hover cursor-default"
    >
      <Archive size={12} className="text-app-muted shrink-0" />
      <span className="truncate">{message}</span>
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  children
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-app-border py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-2 h-7 text-[11px] uppercase tracking-wide text-app-muted hover:text-app-text"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-app-muted">{icon}</span>
        <span className="flex-1 text-left">{title}</span>
        <span className="text-app-muted">{count}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="px-3 py-1 text-[11px] text-app-muted italic">{children}</div>
}
