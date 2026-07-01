import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { FileEdit, CloudOff, Archive, GitBranch, Cloud, Tag } from 'lucide-react'
import { useStore } from '../store/useStore'
import { computeGraph, type GraphRow } from '../lib/graph'
import { relativeTime, initials, colorFromString, dayKey, dayLabel } from '../lib/format'
import { ContextMenu, useContextMenu, type MenuItem } from './ui'
import { ConfirmModal, PromptModal } from './PromptModal'
import type { Commit, CommitRef, Stash } from '@shared/types'

const ROW_H = 48
const LANE_W = 16
const PAD = 10
const R = 5
/** Width of the dedicated refs (labels) column, in px. */
const REFS_W = 200
/** Opacity for graph elements NOT on the current branch line (dimmed). */
const DIM = 0.45

const x = (col: number): number => PAD + col * LANE_W + LANE_W / 2

/** hex color (e.g. "#3b82f6") -> "rgba(r, g, b, a)" for lane-tinted labels. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function CommitGraph(): React.JSX.Element {
  const commits = useStore((s) => s.commits)
  const status = useStore((s) => s.status)
  const stashes = useStore((s) => s.stashes)
  const selection = useStore((s) => s.selection)
  const selectCommit = useStore((s) => s.selectCommit)
  const selectWip = useStore((s) => s.selectWip)
  const setFocusZone = useStore((s) => s.setFocusZone)

  // The commit HEAD points to — root of the current branch's highlighted line.
  const currentTip = useMemo(
    () => commits.find((c) => c.refs.some((r) => r.type === 'HEAD'))?.hash ?? null,
    [commits]
  )
  const currentBranch = status?.current ?? null
  const layout = useMemo(() => computeGraph(commits, currentTip), [commits, currentTip])
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
        <span style={{ width: REFS_W }} className="shrink-0">
          Refs
        </span>
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
        {layout.rows.map((row, idx) => {
          const commit = byHash.get(row.hash)!
          const selected = selection?.type === 'commit' && selection.hash === row.hash
          const stash = stashes.find((s) => s.hash === row.hash)
          const prev = idx > 0 ? byHash.get(layout.rows[idx - 1].hash) : undefined
          const newDay = !prev || dayKey(prev.date) !== dayKey(commit.date)
          return (
            <React.Fragment key={row.hash}>
              {newDay && (
                <DayHeader graphWidth={graphWidth} lanes={topLanes(row)} label={dayLabel(commit.date)} />
              )}
              <CommitRow
                row={row}
                commit={commit}
                graphWidth={graphWidth}
                currentBranch={currentBranch}
                selected={selected}
                innerRef={selected ? setSelRef : undefined}
                onClick={() => {
                  setFocusZone('commits')
                  selectCommit(row.hash)
                }}
                onMenu={(e) =>
                  cm.open(e, stash ? buildStashMenu(stash, setModal) : buildMenu(commit, setModal))
                }
                onRefMenu={(e, ref) => cm.open(e, buildRefMenu(ref, currentBranch, setModal))}
              />
            </React.Fragment>
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

/** Lanes crossing the top edge of a row — used to keep graph lines flowing
 *  through a day-group header without a visual gap. */
function topLanes(row: GraphRow): { col: number; color: string; current?: boolean }[] {
  const lanes: { col: number; color: string; current?: boolean }[] = []
  row.incoming.forEach((e) => lanes.push({ col: e.fromCol, color: e.color, current: e.current }))
  row.passing.forEach((p) => lanes.push({ col: p.col, color: p.color, current: p.current }))
  return lanes
}

const DAY_H = 26

function DayHeader({
  graphWidth,
  lanes,
  label
}: {
  graphWidth: number
  lanes: { col: number; color: string; current?: boolean }[]
  label: string
}): React.JSX.Element {
  return (
    <div className="flex items-center bg-app-panel/50 border-b border-app-border/60 select-none" style={{ height: DAY_H }}>
      <svg width={graphWidth} height={DAY_H} className="shrink-0" style={{ display: 'block' }}>
        {lanes.map((l, i) => (
          <line
            key={i}
            x1={x(l.col)}
            y1={0}
            x2={x(l.col)}
            y2={DAY_H}
            stroke={l.color}
            strokeWidth={l.current ? 3 : 2}
            strokeOpacity={l.current ? 1 : 0.5}
          />
        ))}
      </svg>
      <span className="pl-1 text-[11px] uppercase tracking-wide text-app-muted font-semibold">{label}</span>
    </div>
  )
}

function CommitRow({
  row,
  commit,
  graphWidth,
  currentBranch,
  selected,
  innerRef,
  onClick,
  onMenu,
  onRefMenu
}: {
  row: GraphRow
  commit: Commit
  graphWidth: number
  currentBranch: string | null
  selected: boolean
  innerRef?: (el: HTMLDivElement | null) => void
  onClick: () => void
  onMenu: (e: React.MouseEvent) => void
  onRefMenu: (e: React.MouseEvent, ref: CommitRef) => void
}): React.JSX.Element {
  const isStash = commit.refs.some((r) => r.type === 'stash')

  // The row grows when its labels wrap onto multiple lines. Measure the actual
  // height so the graph lanes (drawn in SVG) stretch to fill it and stay
  // continuous with the neighbouring rows.
  const [rowH, setRowH] = useState(ROW_H)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      rowRef.current = el
      innerRef?.(el)
    },
    [innerRef]
  )
  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return
    // clientHeight (content box) excludes the 1px bottom border; offsetHeight
    // would include it and, since rowH feeds the SVG height, the row would
    // grow by 1px on every re-measure (e.g. each refresh).
    const h = el.clientHeight
    setRowH((prev) => (prev !== h ? h : prev))
  }, [commit.refs, graphWidth])

  const mid = rowH / 2
  return (
    <div
      ref={setRefs}
      onClick={onClick}
      onContextMenu={onMenu}
      className={`flex items-center min-h-[48px] border-b border-app-border/50 cursor-pointer ${
        selected
          ? 'bg-app-accent/15'
          : isStash
            ? 'bg-app-warning/[0.07] hover:bg-app-hover'
            : 'hover:bg-app-hover'
      }`}
    >
      <svg width={graphWidth} height={rowH} className="shrink-0" style={{ display: 'block' }}>
        {row.passing.map((p, i) => (
          <line
            key={`p${i}`}
            x1={x(p.col)}
            y1={0}
            x2={x(p.col)}
            y2={rowH}
            stroke={p.color}
            strokeWidth={p.current ? 3 : 2}
            strokeOpacity={p.current ? 1 : DIM}
          />
        ))}
        {row.incoming.map((e, i) => (
          <path
            key={`i${i}`}
            d={`M ${x(e.fromCol)} 0 C ${x(e.fromCol)} ${mid} ${x(e.toCol)} 0 ${x(e.toCol)} ${mid}`}
            fill="none"
            stroke={e.color}
            strokeWidth={e.current ? 3 : 2}
            strokeOpacity={e.current ? 1 : DIM}
          />
        ))}
        {row.outgoing.map((e, i) => (
          <path
            key={`o${i}`}
            d={`M ${x(e.fromCol)} ${mid} C ${x(e.fromCol)} ${rowH} ${x(e.toCol)} ${mid} ${x(e.toCol)} ${rowH}`}
            fill="none"
            stroke={e.color}
            strokeWidth={e.current ? 3 : 2}
            strokeOpacity={e.current ? 1 : DIM}
          />
        ))}
        {/* soft glow behind the node when it's on the current branch line */}
        {row.current && !isStash && (
          <circle cx={x(row.col)} cy={mid} r={R + 3} fill="none" stroke={row.color} strokeWidth={2} strokeOpacity={0.35} />
        )}
        {isStash ? (
          /* stash = amber rounded square, instantly distinct from round commits */
          <rect
            x={x(row.col) - R - 1}
            y={mid - R - 1}
            width={(R + 1) * 2}
            height={(R + 1) * 2}
            rx={2}
            fill="rgb(var(--app-warning))"
            stroke="rgb(var(--app-bg))"
            strokeWidth={2}
            opacity={row.current ? 1 : DIM}
          />
        ) : (
          /* filled node = pushed, hollow node = local-only (not pushed) */
          <circle
            cx={x(row.col)}
            cy={mid}
            r={R}
            fill={commit.pushed ? row.color : 'rgb(var(--app-bg))'}
            stroke={commit.pushed ? 'rgb(var(--app-bg))' : row.color}
            strokeWidth={2}
            opacity={row.current ? 1 : DIM}
          />
        )}
      </svg>

      <div
        style={{ width: REFS_W }}
        className="shrink-0 flex flex-wrap items-center content-center gap-1 py-1 pl-1 pr-2"
      >
        {commit.refs.map((ref, i) => (
          <RefBadge
            key={i}
            refObj={ref}
            laneColor={row.color}
            isCurrent={ref.type === 'head' && ref.name === currentBranch}
            onMenu={onRefMenu}
          />
        ))}
      </div>

      <div className="flex-1 min-w-0 self-stretch flex items-center gap-1.5 px-2 border-l border-app-border/40">
        {!commit.pushed && !commit.refs.some((r) => r.type === 'stash') && (
          <span
            title="Not pushed to any remote"
            className="flex items-center gap-1 px-1.5 h-[18px] rounded bg-app-warning/20 text-app-warning text-[10px] font-medium shrink-0"
          >
            <CloudOff size={11} /> unpushed
          </span>
        )}
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

function RefBadge({
  refObj,
  laneColor,
  isCurrent = false,
  onMenu
}: {
  refObj: CommitRef
  laneColor: string
  /** true for the head ref of the branch we're currently on */
  isCurrent?: boolean
  /** right-click handler for branch/tag refs (opens a ref-specific menu) */
  onMenu?: (e: React.MouseEvent, ref: CommitRef) => void
}): React.JSX.Element | null {
  const base =
    'px-1.5 h-[18px] inline-flex items-center gap-1 rounded text-[10px] font-semibold shrink-0 max-w-[150px]'
  // Right-click on a branch/tag label opens a menu for that ref, not the commit.
  const menuHandler = onMenu
    ? (e: React.MouseEvent): void => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(e, refObj)
      }
    : undefined

  // HEAD — the "you are here" marker; always the boldest, solid accent chip.
  if (refObj.type === 'HEAD') {
    return (
      <span className={`${base} bg-app-accent text-app-accent-fg font-bold`} title="HEAD — current position">
        HEAD
      </span>
    )
  }
  // Stash — solid amber with its archive icon.
  if (refObj.type === 'stash') {
    return (
      <span className={`${base} bg-app-warning text-app-bg font-bold uppercase tracking-wide`}>
        <Archive size={11} className="shrink-0" /> Stash
      </span>
    )
  }
  // Tag — amber outline with a tag icon (a fixed marker, not a lane).
  if (refObj.type === 'tag') {
    return (
      <ExpandableBadge
        icon={<Tag size={10} className="shrink-0" />}
        name={refObj.name}
        className="text-app-warning border-app-warning/40"
        collapsedBg="bg-app-warning/20"
        onContextMenu={menuHandler}
      />
    )
  }
  // Local (head) / remote branches — tinted with their graph lane color so the
  // label maps to its line; the icon (branch vs cloud) tells the two apart.
  // Double-click checks the branch out. The current branch glows brighter.
  const isRemote = refObj.type === 'remote'
  const Icon = isRemote ? Cloud : GitBranch
  return (
    <ExpandableBadge
      icon={<Icon size={10} className="shrink-0" />}
      name={refObj.name}
      onActivate={() => useStore.getState().checkoutBranch(refObj.name, isRemote)}
      onContextMenu={menuHandler}
      style={
        isCurrent
          ? { color: laneColor, borderColor: laneColor, boxShadow: `0 0 8px ${hexA(laneColor, 0.55)}` }
          : { color: laneColor, borderColor: hexA(laneColor, 0.5) }
      }
      collapsedBgStyle={{ backgroundColor: hexA(laneColor, isCurrent ? 0.35 : 0.16) }}
    />
  )
}

/**
 * A ref badge that truncates to fit its column but, on hover, reveals the full
 * name via an absolutely-positioned overlay — so it never shifts the layout and
 * replaces the native tooltip. Used for the variable-length refs (branches/tags);
 * HEAD/stash are short fixed labels and don't need it.
 */
function ExpandableBadge({
  icon,
  name,
  className = '',
  style,
  collapsedBg = '',
  collapsedBgStyle,
  onActivate,
  onContextMenu
}: {
  icon: React.ReactNode
  name: string
  /** border + text color classes shared by both states (no background) */
  className?: string
  /** border/text color as inline style (for lane-tinted branches) */
  style?: React.CSSProperties
  /** collapsed-state background class */
  collapsedBg?: string
  /** collapsed-state background as inline style */
  collapsedBgStyle?: React.CSSProperties
  /** double-click action (e.g. checkout the branch) */
  onActivate?: () => void
  /** right-click handler (opens a ref-specific menu) */
  onContextMenu?: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const chip =
    'px-1.5 h-[18px] inline-flex items-center gap-1 rounded border text-[10px] font-semibold'
  return (
    <span
      className={`relative inline-flex shrink-0 group/ref ${onActivate ? 'cursor-pointer' : ''}`}
      onDoubleClick={
        onActivate
          ? (e) => {
              e.stopPropagation()
              onActivate()
            }
          : undefined
      }
      onContextMenu={onContextMenu}
    >
      {/* collapsed, in-flow — reserves the footprint */}
      <span className={`${chip} ${className} ${collapsedBg} max-w-[150px]`} style={{ ...style, ...collapsedBgStyle }}>
        {icon}
        <span className="truncate min-w-0">{name}</span>
      </span>
      {/* expanded overlay on hover — absolute, solid background, no layout impact */}
      <span
        className={`${chip} ${className} bg-app-panel-2 absolute left-0 top-0 z-30 hidden w-max max-w-none whitespace-nowrap shadow-lg group-hover/ref:inline-flex`}
        style={style}
        aria-hidden="true"
      >
        {icon}
        {name}
      </span>
    </span>
  )
}

/** Context menu for a branch/tag label — actions target the ref, not the commit. */
function buildRefMenu(
  ref: CommitRef,
  currentBranch: string | null,
  setModal: (n: React.ReactNode) => void
): MenuItem[] {
  const store = useStore.getState
  const close = (): void => setModal(null)

  if (ref.type === 'tag') {
    return [
      { label: 'Checkout (detached)', onClick: () => store().checkoutBranch(ref.name, false) },
      { label: 'Copy tag name', onClick: () => navigator.clipboard.writeText(ref.name) },
      { label: '', separator: true, onClick: () => {} },
      {
        label: 'Delete tag',
        danger: true,
        onClick: () =>
          setModal(
            <ConfirmModal
              title="Delete tag"
              message={`Delete the tag "${ref.name}"?`}
              danger
              confirmText="Delete"
              onConfirm={() => store().deleteTag(ref.name)}
              onClose={close}
            />
          )
      }
    ]
  }

  // Local (head) or remote branch.
  const isRemote = ref.type === 'remote'
  const isCurrent = ref.type === 'head' && ref.name === currentBranch
  const items: MenuItem[] = [
    {
      label: isRemote ? 'Checkout (create local branch)' : 'Checkout',
      disabled: isCurrent,
      onClick: () => store().checkoutBranch(ref.name, isRemote)
    },
    {
      label: 'Merge into current branch',
      disabled: isCurrent,
      onClick: () => store().mergeBranch(ref.name)
    },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Copy name', onClick: () => navigator.clipboard.writeText(ref.name) },
    { label: '', separator: true, onClick: () => {} },
    isRemote
      ? {
          label: 'Delete remote branch',
          danger: true,
          onClick: () =>
            setModal(
              <ConfirmModal
                title="Delete remote branch"
                message={`Delete "${ref.name}" from the remote?\nThis runs git push --delete.`}
                danger
                confirmText="Delete"
                onConfirm={() => store().deleteRemoteBranch(ref.name)}
                onClose={close}
              />
            )
        }
      : {
          label: 'Delete branch',
          danger: true,
          disabled: isCurrent,
          onClick: () =>
            setModal(
              <ConfirmModal
                title="Delete branch"
                message={`Delete the branch "${ref.name}"?`}
                danger
                confirmText="Delete"
                onConfirm={() => store().deleteBranch(ref.name, false)}
                onClose={close}
              />
            )
        }
  ]
  return items
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
