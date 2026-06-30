import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { FileEdit, CloudOff, Archive } from 'lucide-react'
import { useStore } from '../store/useStore'
import { computeGraph, type GraphRow } from '../lib/graph'
import { relativeTime, initials, colorFromString } from '../lib/format'
import { ContextMenu, useContextMenu, type MenuItem } from './ui'
import { ConfirmModal, PromptModal } from './PromptModal'
import type { Commit, CommitRef, Stash } from '@shared/types'

const ROW_H = 48
const LANE_W = 16
const PAD = 10
const R = 5

const x = (col: number): number => PAD + col * LANE_W + LANE_W / 2

export function CommitGraph(): React.JSX.Element {
  const commits = useStore((s) => s.commits)
  const status = useStore((s) => s.status)
  const stashes = useStore((s) => s.stashes)
  const selection = useStore((s) => s.selection)
  const selectCommit = useStore((s) => s.selectCommit)
  const selectWip = useStore((s) => s.selectWip)
  const setFocusZone = useStore((s) => s.setFocusZone)

  const layout = useMemo(() => computeGraph(commits), [commits])
  const graphWidth = layout.width * LANE_W + PAD * 2
  const byHash = useMemo(() => {
    const m = new Map<string, Commit>()
    commits.forEach((c) => m.set(c.hash, c))
    return m
  }, [commits])

  const cm = useContextMenu()
  const [modal, setModal] = useState<React.ReactNode>(null)

  const selectedRef = useRef<HTMLElement | null>(null)
  const setSelRef = useCallback((el: HTMLElement | null) => {
    selectedRef.current = el
  }, [])
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selection])

  const dirty = status && !status.isClean
  const changeCount = status ? status.staged.length + status.unstaged.length : 0

  return (
    <div className="h-full overflow-auto bg-app-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center h-7 px-3 bg-app-panel border-b border-app-border text-[11px] uppercase tracking-wide text-app-muted">
        <span style={{ width: graphWidth }}>Graph</span>
        <span className="flex-1">Description</span>
        <span className="w-40">Author</span>
        <span className="w-20 text-right">Date</span>
        <span className="w-16 text-right">SHA</span>
      </div>

      {dirty && (
        <button
          ref={selection?.type === 'wip' ? setSelRef : undefined}
          onClick={() => {
            setFocusZone('commits')
            selectWip()
          }}
          className={`flex items-center w-full h-10 px-3 border-b border-app-border text-left ${
            selection?.type === 'wip' ? 'bg-app-accent/15' : 'hover:bg-app-hover'
          }`}
        >
          <span style={{ width: graphWidth }} className="flex items-center">
            <span
              className="flex items-center justify-center rounded-full border-2 border-dashed"
              style={{ width: 16, height: 16, borderColor: 'rgb(var(--app-accent))', marginLeft: PAD }}
            >
              <FileEdit size={9} className="text-app-accent" />
            </span>
          </span>
          <span className="flex-1 text-app-text font-medium">
            Uncommitted changes
            <span className="ml-2 text-[11px] text-app-muted">{changeCount} files</span>
          </span>
        </button>
      )}

      <div>
        {layout.rows.map((row) => {
          const commit = byHash.get(row.hash)!
          const selected = selection?.type === 'commit' && selection.hash === row.hash
          const stash = stashes.find((s) => s.hash === row.hash)
          return (
            <CommitRow
              key={row.hash}
              row={row}
              commit={commit}
              graphWidth={graphWidth}
              selected={selected}
              innerRef={selected ? setSelRef : undefined}
              onClick={() => {
                setFocusZone('commits')
                selectCommit(row.hash)
              }}
              onMenu={(e) =>
                cm.open(e, stash ? buildStashMenu(stash, setModal) : buildMenu(commit, setModal))
              }
            />
          )
        })}
        {commits.length === 0 && (
          <div className="p-8 text-center text-app-muted text-[13px]">
            No commits yet. Make your first commit from “Working changes”.
          </div>
        )}
      </div>

      {cm.menu && <ContextMenu {...cm.menu} onClose={cm.close} />}
      {modal}
    </div>
  )
}

function CommitRow({
  row,
  commit,
  graphWidth,
  selected,
  innerRef,
  onClick,
  onMenu
}: {
  row: GraphRow
  commit: Commit
  graphWidth: number
  selected: boolean
  innerRef?: (el: HTMLDivElement | null) => void
  onClick: () => void
  onMenu: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const isStash = commit.refs.some((r) => r.type === 'stash')
  return (
    <div
      ref={innerRef}
      onClick={onClick}
      onContextMenu={onMenu}
      className={`flex items-center h-12 border-b border-app-border/50 cursor-pointer ${
        selected
          ? 'bg-app-accent/15'
          : isStash
            ? 'bg-app-warning/[0.07] hover:bg-app-hover'
            : 'hover:bg-app-hover'
      }`}
    >
      <svg width={graphWidth} height={ROW_H} className="shrink-0" style={{ display: 'block' }}>
        {row.passing.map((p, i) => (
          <line
            key={`p${i}`}
            x1={x(p.col)}
            y1={0}
            x2={x(p.col)}
            y2={ROW_H}
            stroke={p.color}
            strokeWidth={2}
          />
        ))}
        {row.incoming.map((e, i) => (
          <path
            key={`i${i}`}
            d={`M ${x(e.fromCol)} 0 C ${x(e.fromCol)} ${ROW_H / 2} ${x(e.toCol)} 0 ${x(e.toCol)} ${ROW_H / 2}`}
            fill="none"
            stroke={e.color}
            strokeWidth={2}
          />
        ))}
        {row.outgoing.map((e, i) => (
          <path
            key={`o${i}`}
            d={`M ${x(e.fromCol)} ${ROW_H / 2} C ${x(e.fromCol)} ${ROW_H} ${x(e.toCol)} ${ROW_H / 2} ${x(e.toCol)} ${ROW_H}`}
            fill="none"
            stroke={e.color}
            strokeWidth={2}
          />
        ))}
        {isStash ? (
          /* stash = amber rounded square, instantly distinct from round commits */
          <rect
            x={x(row.col) - R - 1}
            y={ROW_H / 2 - R - 1}
            width={(R + 1) * 2}
            height={(R + 1) * 2}
            rx={2}
            fill="rgb(var(--app-warning))"
            stroke="rgb(var(--app-bg))"
            strokeWidth={2}
          />
        ) : (
          /* filled node = pushed, hollow node = local-only (not pushed) */
          <circle
            cx={x(row.col)}
            cy={ROW_H / 2}
            r={R}
            fill={commit.pushed ? row.color : 'rgb(var(--app-bg))'}
            stroke={commit.pushed ? 'rgb(var(--app-bg))' : row.color}
            strokeWidth={2}
          />
        )}
      </svg>

      <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-2">
        {!commit.pushed && !commit.refs.some((r) => r.type === 'stash') && (
          <span
            title="Not pushed to any remote"
            className="flex items-center gap-1 px-1.5 h-[18px] rounded bg-app-warning/20 text-app-warning text-[10px] font-medium shrink-0"
          >
            <CloudOff size={11} /> unpushed
          </span>
        )}
        {commit.refs.map((ref, i) => (
          <RefBadge key={i} refObj={ref} />
        ))}
        <span className="truncate text-app-text">{commit.subject}</span>
      </div>

      <div className="w-40 flex items-center gap-1.5 shrink-0 pr-2">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0"
          style={{ background: colorFromString(commit.authorEmail) }}
          title={`${commit.author} <${commit.authorEmail}>`}
        >
          {initials(commit.author)}
        </span>
        <span className="truncate text-app-muted text-[12px]">{commit.author}</span>
      </div>
      <span className="w-20 text-right text-app-muted text-[12px] shrink-0 pr-2">
        {relativeTime(commit.date)}
      </span>
      <span className="w-16 text-right font-mono text-app-muted text-[11px] shrink-0 pr-3">
        {commit.shortHash}
      </span>
    </div>
  )
}

function RefBadge({ refObj }: { refObj: CommitRef }): React.JSX.Element | null {
  if (refObj.type === 'HEAD') {
    return (
      <span className="px-1.5 h-[18px] inline-flex items-center rounded bg-app-accent text-app-accent-fg text-[10px] font-bold shrink-0">
        HEAD
      </span>
    )
  }
  if (refObj.type === 'stash') {
    return (
      <span className="px-1.5 h-[18px] inline-flex items-center gap-1 rounded bg-app-warning text-app-bg text-[10px] font-bold shrink-0 uppercase tracking-wide">
        <Archive size={11} /> Stash
      </span>
    )
  }
  const styles: Record<string, string> = {
    head: 'bg-app-accent/20 text-app-accent border border-app-accent/40',
    remote: 'bg-app-panel-2 text-app-muted border border-app-border',
    tag: 'bg-app-warning/20 text-app-warning border border-app-warning/40'
  }
  return (
    <span
      className={`px-1.5 h-[18px] inline-flex items-center rounded text-[10px] font-medium shrink-0 max-w-[160px] truncate ${
        styles[refObj.type] ?? styles.head
      }`}
      title={refObj.name}
    >
      {refObj.name}
    </span>
  )
}

function buildStashMenu(stash: Stash, setModal: (n: React.ReactNode) => void): MenuItem[] {
  const store = useStore.getState
  const close = (): void => setModal(null)
  return [
    { label: 'Apply (keep stash)', onClick: () => store().stashApply(stash.index) },
    { label: 'Apply and drop (pop)', onClick: () => store().stashPop(stash.index) },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Edit message…',
      onClick: () =>
        setModal(
          <PromptModal
            title="Edit stash message"
            label="New message for this stash"
            initialValue={stash.message}
            confirmText="Save"
            onConfirm={(msg) => store().stashRename(stash.index, msg)}
            onClose={close}
          />
        )
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Drop stash',
      danger: true,
      onClick: () =>
        setModal(
          <ConfirmModal
            title="Drop stash"
            message={`Drop stash@{${stash.index}}?`}
            danger
            confirmText="Drop"
            onConfirm={() => store().stashDrop(stash.index)}
            onClose={close}
          />
        )
    }
  ]
}

function buildMenu(commit: Commit, setModal: (n: React.ReactNode) => void): MenuItem[] {
  const store = useStore.getState
  const close = (): void => setModal(null)
  return [
    {
      label: 'Checkout this commit',
      onClick: () =>
        setModal(
          <ConfirmModal
            title="Checkout commit"
            message={`Switch to a 'detached HEAD' state on commit ${commit.shortHash}?`}
            confirmText="Checkout"
            onConfirm={() => store().checkoutCommit(commit.hash)}
            onClose={close}
          />
        )
    },
    {
      label: 'Create branch here',
      onClick: () =>
        setModal(
          <BranchFromCommit hash={commit.hash} onClose={close} />
        )
    },
    {
      label: 'Create tag here',
      onClick: () =>
        setModal(
          <PromptModal
            title="New tag"
            label={`Tag on commit ${commit.shortHash}`}
            placeholder="v1.0.0"
            confirmText="Create tag"
            onConfirm={(name) => store().createTag(name, commit.hash)}
            onClose={close}
          />
        )
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Reset current branch here (soft)',
      onClick: () => store().resetTo(commit.hash, 'soft')
    },
    {
      label: 'Reset current branch here (mixed)',
      onClick: () => store().resetTo(commit.hash, 'mixed')
    },
    {
      label: 'Reset current branch here (hard)',
      danger: true,
      onClick: () =>
        setModal(
          <ConfirmModal
            title="Reset --hard"
            message={`WARNING: all local changes will be lost.\nHard reset to ${commit.shortHash}?`}
            danger
            confirmText="Hard reset"
            onConfirm={() => store().resetTo(commit.hash, 'hard')}
            onClose={close}
          />
        )
    },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Revert (create inverse commit)', onClick: () => store().revertCommit(commit.hash) },
    { label: 'Cherry-pick onto current branch', onClick: () => store().cherryPick(commit.hash) },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Copy full SHA',
      onClick: () => navigator.clipboard.writeText(commit.hash)
    }
  ]
}

function BranchFromCommit({ hash, onClose }: { hash: string; onClose: () => void }): React.JSX.Element {
  // Checkout the commit (detached), then create a branch pointing there.
  return (
    <PromptModal
      title="Create branch from commit"
      label="Name of the new branch"
      placeholder="feature/from-commit"
      confirmText="Create"
      onConfirm={async (name) => {
        const store = useStore.getState()
        await store.checkoutCommit(hash)
        await store.createBranch(name, true)
      }}
      onClose={onClose}
    />
  )
}
