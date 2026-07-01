import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { FileEdit, CloudOff, Archive, GitBranch, Cloud, Tag } from 'lucide-react'
import { useStore } from '../store/useStore'
import { computeGraph, type GraphRow } from '../lib/graph'
import { relativeTime, initials, colorFromString, dayKey, dayLabel } from '../lib/format'
import { ContextMenu, useContextMenu, type MenuItem } from './ui'
import { ConfirmModal, PromptModal } from './PromptModal'
import type { Commit, CommitRef, Stash } from '@shared/types'

const ROW_H = 34
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

/** Black or white text, whichever reads better on the given solid color. */
function contrastText(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#000000' : '#ffffff'
}

export function CommitGraph(): React.JSX.Element {
  const commits = useStore((s) => s.commits)
  const status = useStore((s) => s.status)
  const detached = useStore((s) => s.repo?.isDetached ?? false)
  const searchMatches = useStore((s) => s.searchMatches)
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
          className={`flex items-center w-full h-9 px-3 border-b border-app-border text-left ${
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
                detached={detached}
                dimmed={!!searchMatches && !searchMatches.has(row.hash)}
                selected={selected}
                innerRef={selected ? setSelRef : undefined}
                onClick={() => {
                  setFocusZone('commits')
                  selectCommit(row.hash)
                }}
                onMenu={(e) =>
                  cm.open(e, stash ? buildStashMenu(stash, setModal) : buildMenu(commit, setModal))
                }
                onBranchMenu={(e, group) => cm.open(e, buildBranchMenu(group, currentBranch, setModal))}
                onTagMenu={(e, ref) => cm.open(e, buildTagMenu(ref, setModal))}
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
  detached,
  dimmed,
  selected,
  innerRef,
  onClick,
  onMenu,
  onBranchMenu,
  onTagMenu
}: {
  row: GraphRow
  commit: Commit
  graphWidth: number
  currentBranch: string | null
  detached: boolean
  dimmed: boolean
  selected: boolean
  innerRef?: (el: HTMLDivElement | null) => void
  onClick: () => void
  onMenu: (e: React.MouseEvent) => void
  onBranchMenu: (e: React.MouseEvent, group: BranchGroup) => void
  onTagMenu: (e: React.MouseEvent, ref: CommitRef) => void
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
      className={`flex items-center min-h-[34px] border-b border-app-border/50 cursor-pointer transition-opacity ${
        dimmed ? 'opacity-25' : ''
      } ${
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

      <div style={{ width: REFS_W }} className="shrink-0 flex items-center gap-1 py-1 pl-1 pr-2">
        <RefLabels
          labels={[
            // In detached HEAD there's no current branch to mark "you are here",
            // so show an explicit HEAD chip on the checked-out commit.
            ...(detached && commit.refs.some((r) => r.type === 'HEAD')
              ? [<HeadBadge key="head" />]
              : []),
            ...groupBranchRefs(commit.refs).map((g) => (
              <BranchBadge
                key={`b:${g.base}`}
                group={g}
                laneColor={row.color}
                isCurrent={!!g.local && g.local === currentBranch}
                onMenu={onBranchMenu}
              />
            )),
            ...commit.refs
              .filter((r) => r.type === 'tag')
              .map((r, i) => <TagBadge key={`t:${i}`} refObj={r} onMenu={onTagMenu} />),
            ...(commit.refs.some((r) => r.type === 'stash') ? [<StashBadge key="stash" />] : [])
          ]}
        />
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

/** A branch that may exist locally, on a remote, or both — one label per name. */
interface BranchGroup {
  base: string
  local?: string
  remotes: string[]
}

/** Group a commit's branch refs (head + remote) by base name so the local and
 *  remote variants of the same branch collapse into a single label. */
function groupBranchRefs(refs: CommitRef[]): BranchGroup[] {
  const map = new Map<string, BranchGroup>()
  const order: string[] = []
  const get = (base: string): BranchGroup => {
    let g = map.get(base)
    if (!g) {
      g = { base, remotes: [] }
      map.set(base, g)
      order.push(base)
    }
    return g
  }
  for (const r of refs) {
    if (r.type === 'head') get(r.name).local = r.name
    else if (r.type === 'remote') get(r.name.slice(r.name.indexOf('/') + 1)).remotes.push(r.name)
  }
  return order.map((b) => map.get(b)!)
}

/** Renders a commit's ref labels compactly: the first one plus a "+X" chip when
 *  there are more, revealing the full set on hover (in the foreground) so a busy
 *  commit never stretches the row. */
function RefLabels({ labels }: { labels: React.ReactNode[] }): React.JSX.Element | null {
  if (labels.length === 0) return null
  if (labels.length === 1) return <>{labels[0]}</>
  return (
    <>
      {labels[0]}
      <span className="relative inline-flex shrink-0 group/more">
        <span className="px-1.5 h-[20px] inline-flex items-center rounded border border-app-border bg-app-panel-2 text-app-muted text-[11px] font-semibold cursor-default">
          +{labels.length - 1}
        </span>
        <span className="absolute left-0 top-0 z-40 hidden w-max max-w-[320px] group-hover/more:flex flex-wrap items-center gap-1 p-1.5 rounded-md border border-app-border bg-app-panel shadow-2xl">
          {labels}
        </span>
      </span>
    </>
  )
}

/** A branch label: local icon (⎇) and/or remote icon (☁) plus the name. The
 *  current branch takes HEAD's role — a solid accent chip. */
function BranchBadge({
  group,
  laneColor,
  isCurrent,
  onMenu
}: {
  group: BranchGroup
  laneColor: string
  isCurrent: boolean
  onMenu: (e: React.MouseEvent, group: BranchGroup) => void
}): React.JSX.Element {
  const icons = (
    <>
      {group.local && <GitBranch size={11} className="shrink-0" />}
      {group.remotes.length > 0 && <Cloud size={11} className="shrink-0" />}
    </>
  )
  const activate = (): void => {
    void useStore.getState().checkoutBranch(group.local ?? group.remotes[0], !group.local)
  }
  const menuHandler = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onMenu(e, group)
  }
  if (isCurrent) {
    // HEAD's format (solid, bold chip) but in the branch's own graph color.
    return (
      <ExpandableBadge
        icon={icons}
        name={group.base}
        className="font-bold"
        style={{ color: contrastText(laneColor), backgroundColor: laneColor, borderColor: laneColor }}
        onActivate={activate}
        onContextMenu={menuHandler}
      />
    )
  }
  return (
    <ExpandableBadge
      icon={icons}
      name={group.base}
      style={{ color: laneColor, borderColor: hexA(laneColor, 0.5) }}
      collapsedBgStyle={{ backgroundColor: hexA(laneColor, 0.16) }}
      onActivate={activate}
      onContextMenu={menuHandler}
    />
  )
}

function TagBadge({
  refObj,
  onMenu
}: {
  refObj: CommitRef
  onMenu: (e: React.MouseEvent, ref: CommitRef) => void
}): React.JSX.Element {
  return (
    <ExpandableBadge
      icon={<Tag size={11} className="shrink-0" />}
      name={refObj.name}
      className="text-app-warning border-app-warning/40"
      collapsedBg="bg-app-warning/20"
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(e, refObj)
      }}
    />
  )
}

function StashBadge(): React.JSX.Element {
  return (
    <span className="px-2 h-[20px] inline-flex items-center gap-1 rounded text-[11px] font-bold shrink-0 bg-app-warning text-app-bg uppercase tracking-wide">
      <Archive size={12} className="shrink-0" /> Stash
    </span>
  )
}

/** "You are here" marker shown only in detached HEAD (no current branch). */
function HeadBadge(): React.JSX.Element {
  return (
    <span
      title="Detached HEAD — not on a branch"
      className="px-2 h-[20px] inline-flex items-center rounded text-[11px] font-bold shrink-0 bg-app-accent text-app-accent-fg uppercase tracking-wide"
    >
      HEAD
    </span>
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
  /** border/text color (and, for the current branch, solid bg) as inline style */
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
    'px-2 h-[20px] inline-flex items-center gap-1 rounded border text-[11px] font-semibold'
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

/** Context menu for a tag label — actions target the tag, not the commit. */
function buildTagMenu(ref: CommitRef, setModal: (n: React.ReactNode) => void): MenuItem[] {
  const store = useStore.getState
  const close = (): void => setModal(null)
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

/** Context menu for a consolidated branch label (local and/or remote). */
function buildBranchMenu(
  group: BranchGroup,
  currentBranch: string | null,
  setModal: (n: React.ReactNode) => void
): MenuItem[] {
  const store = useStore.getState
  const close = (): void => setModal(null)
  const local = group.local
  const isCurrent = !!local && local === currentBranch
  const primary = local ?? group.remotes[0]
  const items: MenuItem[] = [
    {
      label: local ? 'Checkout' : 'Checkout (create local branch)',
      disabled: isCurrent,
      onClick: () => store().checkoutBranch(primary, !local)
    },
    {
      label: 'Merge into current branch',
      disabled: isCurrent,
      onClick: () => store().mergeBranch(primary)
    },
    { label: '', separator: true, onClick: () => {} },
    { label: 'Copy name', onClick: () => navigator.clipboard.writeText(group.base) }
  ]
  if (local) {
    items.push({ label: '', separator: true, onClick: () => {} })
    items.push({
      label: 'Rename branch…',
      onClick: () =>
        setModal(
          <PromptModal
            title="Rename branch"
            label={`New name for "${local}"`}
            initialValue={local}
            confirmText="Rename"
            onConfirm={(name) => {
              const next = name.trim()
              if (next && next !== local) store().renameBranch(local, next)
            }}
            onClose={close}
          />
        )
    })
    items.push({
      label: 'Delete branch',
      danger: true,
      disabled: isCurrent,
      onClick: () =>
        setModal(
          <ConfirmModal
            title="Delete branch"
            message={`Delete the branch "${local}"?\nIt is removed even if not fully merged (e.g. after a squash merge); recoverable from git's reflog.`}
            danger
            confirmText="Delete"
            onConfirm={() => store().deleteBranch(local, true)}
            onClose={close}
          />
        )
    })
  }
  if (group.remotes.length > 0) {
    items.push({ label: '', separator: true, onClick: () => {} })
    for (const rn of group.remotes) {
      items.push({
        label: group.remotes.length > 1 ? `Delete ${rn}` : 'Delete remote branch',
        danger: true,
        onClick: () =>
          setModal(
            <ConfirmModal
              title="Delete remote branch"
              message={`Delete "${rn}" from the remote?\nThis runs git push --delete.`}
              danger
              confirmText="Delete"
              onConfirm={() => store().deleteRemoteBranch(rn)}
              onClose={close}
            />
          )
      })
    }
  }
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
