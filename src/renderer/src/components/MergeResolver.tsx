import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Check, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, call } from '../lib/ipc'
import { Button, Spinner } from './ui'
import {
  parseConflicts,
  assembleResult,
  type MergePart,
  type ConflictHunk,
  type Selection
} from '../lib/conflicts'

type Tone = 'normal' | 'ours' | 'theirs' | 'unresolved'
type Side = 'ours' | 'theirs'

interface Row {
  type: 'code' | 'marker'
  num: number | null
  text: string
  tone: Tone
  ci: number | null
  /** index into the side's line array (code rows inside a conflict) */
  lineIndex?: number
  selected?: boolean
  /** 1-based position of this line in the hunk's result order */
  order?: number
  /** marker rows: how many lines picked so far in this hunk */
  picked?: number
}

/**
 * Three-pane merge editor for a single conflicted file. OURS (left) and THEIRS
 * (right) on top, the assembled RESULT below — each pane a code view with line
 * numbers and a minimap, all three scrolling together. Within a conflict you
 * click individual lines to keep them; the result takes them in click order
 * (a badge shows each line's position). "Add all" / "Clear" act on a whole hunk.
 */
export function MergeResolver({
  file,
  onClose
}: {
  file: string
  onClose: () => void
}): React.JSX.Element {
  const repoPath = useStore((s) => s.repo?.path)
  const busy = useStore((s) => s.busy)
  const resolveConflictWith = useStore((s) => s.resolveConflictWith)

  const [parts, setParts] = useState<MergePart[] | null>(null)
  const [selections, setSelections] = useState<Selection[]>([])

  const conflicts = useMemo(
    () => (parts ? (parts.filter((p) => p.kind === 'conflict') as ConflictHunk[]) : []),
    [parts]
  )

  useEffect(() => {
    if (!repoPath) return
    let alive = true
    call(api.readConflictText(repoPath, file))
      .then((text) => {
        if (!alive) return
        const p = parseConflicts(text)
        setParts(p)
        setSelections(p.filter((x) => x.kind === 'conflict').map(() => []))
      })
      .catch(() => alive && setParts([]))
    return () => {
      alive = false
    }
  }, [repoPath, file])

  const result = useMemo(
    () => (parts ? assembleResult(parts, selections) : { text: '', unresolved: 0 }),
    [parts, selections]
  )

  const toggleLine = useCallback((ci: number, side: Side, index: number): void => {
    setSelections((prev) =>
      prev.map((sel, i) => {
        if (i !== ci) return sel
        const pos = sel.findIndex((r) => r.side === side && r.index === index)
        return pos >= 0 ? sel.filter((_, k) => k !== pos) : [...sel, { side, index }]
      })
    )
  }, [])

  const addAll = useCallback(
    (ci: number, side: Side): void => {
      const src = side === 'ours' ? conflicts[ci]?.ours : conflicts[ci]?.theirs
      if (!src) return
      setSelections((prev) =>
        prev.map((sel, i) => {
          if (i !== ci) return sel
          const present = new Set(sel.filter((r) => r.side === side).map((r) => r.index))
          const additions = src
            .map((_, idx) => idx)
            .filter((idx) => !present.has(idx))
            .map((idx) => ({ side, index: idx }))
          return [...sel, ...additions]
        })
      )
    },
    [conflicts]
  )

  const clearHunk = useCallback((ci: number): void => {
    setSelections((prev) => prev.map((sel, i) => (i === ci ? [] : sel)))
  }, [])

  const oursRows = useMemo(
    () => (parts ? sideRows(parts, selections, 'ours') : []),
    [parts, selections]
  )
  const theirsRows = useMemo(
    () => (parts ? sideRows(parts, selections, 'theirs') : []),
    [parts, selections]
  )
  const resultRows = useMemo(
    () => (parts ? buildResultRows(parts, selections) : []),
    [parts, selections]
  )

  // Synced scrolling across the three panes (vertical + horizontal).
  const oursRef = useRef<HTMLDivElement>(null)
  const theirsRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const mirror = useCallback((from: React.RefObject<HTMLDivElement>): void => {
    if (syncing.current || !from.current) return
    syncing.current = true
    const src = from.current
    for (const r of [oursRef, theirsRef, resultRef]) {
      if (r !== from && r.current) {
        r.current.scrollTop = src.scrollTop
        r.current.scrollLeft = src.scrollLeft
      }
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

  const save = async (): Promise<void> => {
    if (!parts || result.unresolved > 0) return
    await resolveConflictWith(file, result.text)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-app-bg">
      {/* toolbar */}
      <div className="shrink-0 flex items-center gap-3 h-10 px-3 bg-app-panel border-b border-app-border">
        <AlertTriangle size={15} className="text-app-warning shrink-0" />
        <span className="truncate text-[13px] text-app-text font-medium" title={file}>
          {file}
        </span>
        <span className="text-[12px] text-app-muted shrink-0">
          {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          {result.unresolved > 0 ? ` · ${result.unresolved} unresolved` : ' · all resolved'}
        </span>
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !parts || result.unresolved > 0}
          title={result.unresolved > 0 ? 'Keep at least one line for every conflict' : 'Save and stage'}
        >
          <Check size={14} /> Save resolution
        </Button>
        <Button onClick={onClose}>
          <X size={14} /> Cancel
        </Button>
      </div>

      {parts === null ? (
        <div className="flex-1 flex items-center justify-center text-app-muted text-[13px]">
          <Spinner /> <span className="ml-2">Loading conflict…</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            <MergePane
              title="Ours (current)"
              rows={oursRows}
              scrollRef={oursRef}
              onScroll={() => mirror(oursRef)}
              onToggleLine={(ci, li) => toggleLine(ci, 'ours', li)}
              onAddAll={(ci) => addAll(ci, 'ours')}
              onClear={clearHunk}
            />
            <div className="w-px bg-app-border shrink-0" />
            <MergePane
              title="Theirs (incoming)"
              rows={theirsRows}
              scrollRef={theirsRef}
              onScroll={() => mirror(theirsRef)}
              onToggleLine={(ci, li) => toggleLine(ci, 'theirs', li)}
              onAddAll={(ci) => addAll(ci, 'theirs')}
              onClear={clearHunk}
            />
          </div>
          <div className="h-[38%] min-h-[120px] border-t border-app-border flex flex-col">
            <MergePane title="Result" rows={resultRows} scrollRef={resultRef} onScroll={() => mirror(resultRef)} />
          </div>
        </div>
      )}
    </div>
  )
}

function sideRows(parts: MergePart[], selections: Selection[], side: Side): Row[] {
  const rows: Row[] = []
  let ln = 0
  let ci = -1
  for (const p of parts) {
    if (p.kind === 'context') {
      for (const l of p.lines) rows.push({ type: 'code', num: ++ln, text: l, tone: 'normal', ci: null })
    } else {
      ci++
      const sel = selections[ci] ?? []
      const lines = side === 'ours' ? p.ours : p.theirs
      rows.push({
        type: 'marker',
        num: null,
        text: `Conflict ${ci + 1} · ${side}`,
        tone: side,
        ci,
        picked: sel.filter((r) => r.side === side).length
      })
      lines.forEach((l, idx) => {
        const pos = sel.findIndex((r) => r.side === side && r.index === idx)
        rows.push({
          type: 'code',
          num: ++ln,
          text: l,
          tone: side,
          ci,
          lineIndex: idx,
          selected: pos >= 0,
          order: pos >= 0 ? pos + 1 : undefined
        })
      })
    }
  }
  return rows
}

function buildResultRows(parts: MergePart[], selections: Selection[]): Row[] {
  const rows: Row[] = []
  let ln = 0
  let ci = -1
  for (const p of parts) {
    if (p.kind === 'context') {
      for (const l of p.lines) rows.push({ type: 'code', num: ++ln, text: l, tone: 'normal', ci: null })
    } else {
      ci++
      const sel = selections[ci] ?? []
      if (sel.length === 0) {
        rows.push({ type: 'marker', num: null, text: `Conflict ${ci + 1} — unresolved`, tone: 'unresolved', ci: null })
      } else {
        for (const ref of sel) {
          const src = ref.side === 'ours' ? p.ours : p.theirs
          rows.push({ type: 'code', num: ++ln, text: src[ref.index] ?? '', tone: ref.side, ci: null })
        }
      }
    }
  }
  return rows
}

function toneClass(tone: Tone, selected?: boolean): string {
  if (tone === 'ours') return selected ? 'bg-app-success/20' : 'bg-app-success/5'
  if (tone === 'theirs') return selected ? 'bg-app-accent/20' : 'bg-app-accent/5'
  if (tone === 'unresolved') return 'bg-app-warning/15 text-app-warning'
  return ''
}

function MergePane({
  title,
  rows,
  scrollRef,
  onScroll,
  onToggleLine,
  onAddAll,
  onClear
}: {
  title: string
  rows: Row[]
  scrollRef: React.RefObject<HTMLDivElement>
  onScroll: () => void
  onToggleLine?: (ci: number, lineIndex: number) => void
  onAddAll?: (ci: number) => void
  onClear?: (ci: number) => void
}): React.JSX.Element {
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="shrink-0 px-3 py-1 text-[11px] uppercase tracking-wide text-app-muted bg-app-panel/60 border-b border-app-border">
        {title}
      </div>
      <div className="flex-1 min-h-0 flex">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-w-0 overflow-auto bg-app-bg">
          <table className="w-max min-w-full border-collapse font-mono text-[12px] leading-[18px]">
            <tbody>
              {rows.map((r, i) => {
                if (r.type === 'marker') {
                  const bulk = r.ci != null && !!onAddAll
                  return (
                    <tr key={i} className={toneClass(r.tone)}>
                      <td className="w-10 px-1 border-r border-app-border" />
                      <td className="pl-2 pr-3 whitespace-pre align-top text-[10px] uppercase tracking-wide">
                        <span className="inline-flex items-center gap-2">
                          <span>{r.text}{r.picked ? ` · ${r.picked} kept` : ''}</span>
                          {bulk && (
                            <>
                              <button
                                onClick={() => onAddAll!(r.ci as number)}
                                className="normal-case px-1.5 rounded border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover"
                              >
                                Add all
                              </button>
                              <button
                                onClick={() => onClear?.(r.ci as number)}
                                className="normal-case px-1.5 rounded border border-app-border text-app-muted hover:text-app-text hover:bg-app-hover"
                              >
                                Clear
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                }
                const clickable = r.ci != null && r.lineIndex != null && !!onToggleLine
                return (
                  <tr
                    key={i}
                    onClick={clickable ? () => onToggleLine!(r.ci as number, r.lineIndex as number) : undefined}
                    className={`${toneClass(r.tone, r.selected)} ${clickable ? 'cursor-pointer hover:brightness-125' : ''}`}
                  >
                    <td className="w-10 px-1 text-right select-none align-top border-r border-app-border">
                      {r.selected ? (
                        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-app-accent text-app-accent-fg text-[10px]">
                          {r.order}
                        </span>
                      ) : (
                        <span className="text-app-muted/50">{r.num ?? ''}</span>
                      )}
                    </td>
                    <td className="pl-2 pr-3 whitespace-pre align-top selectable text-app-text/90">
                      {r.text === '' ? ' ' : r.text}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <PaneMinimap rows={rows} scrollRef={scrollRef} />
      </div>
    </div>
  )
}

const MINIMAP_W = 72

function PaneMinimap({
  rows,
  scrollRef
}: {
  rows: Row[]
  scrollRef: React.RefObject<HTMLDivElement>
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [vp, setVp] = useState({ top: 0, height: 1 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const W = wrap.clientWidth
    const H = wrap.clientHeight
    if (W === 0 || H === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const n = rows.length || 1
    const rowH = H / n
    const barH = Math.max(1, Math.min(rowH, 2))
    const su = themeRGB('--app-success')
    const ac = themeRGB('--app-accent')
    const wa = themeRGB('--app-warning')
    const mu = themeRGB('--app-muted')
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const len = r.text.replace(/\t/g, '    ').trimEnd().length
      const alpha = r.selected ? 0.9 : r.tone === 'normal' ? 0.28 : 0.5
      if (r.tone === 'ours') ctx.fillStyle = `rgba(${su[0]},${su[1]},${su[2]},${alpha})`
      else if (r.tone === 'theirs') ctx.fillStyle = `rgba(${ac[0]},${ac[1]},${ac[2]},${alpha})`
      else if (r.tone === 'unresolved') ctx.fillStyle = `rgba(${wa[0]},${wa[1]},${wa[2]},0.9)`
      else {
        if (len === 0) continue
        ctx.fillStyle = `rgba(${mu[0]},${mu[1]},${mu[2]},0.28)`
      }
      const w = r.tone === 'unresolved' ? W - 8 : Math.max(2, Math.min(W - 8, len * 0.8))
      ctx.fillRect(4, i * rowH, w, barH)
    }
  }, [rows])

  useEffect(() => {
    draw()
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= 0) return
      setVp({ top: scrollTop / scrollHeight, height: Math.min(1, clientHeight / scrollHeight) })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [scrollRef, rows])

  const scrub = useCallback(
    (clientY: number): void => {
      const el = scrollRef.current
      const wrap = wrapRef.current
      if (!el || !wrap) return
      const rect = wrap.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
    },
    [scrollRef]
  )

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (dragging.current) scrub(e.clientY)
    }
    const onUp = (): void => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [scrub])

  return (
    <div
      ref={wrapRef}
      onMouseDown={(e) => {
        dragging.current = true
        scrub(e.clientY)
      }}
      className="relative shrink-0 h-full border-l border-app-border bg-app-bg overflow-hidden cursor-pointer select-none"
      style={{ width: MINIMAP_W }}
    >
      <canvas ref={canvasRef} className="block" />
      <div
        className="absolute left-0 right-0 bg-app-accent/20 border-y border-app-accent/50 pointer-events-none"
        style={{ top: `${vp.top * 100}%`, height: `${Math.max(vp.height * 100, 1.5)}%` }}
      />
    </div>
  )
}

/** Read a theme color CSS var ("r g b" channels) as an [r, g, b] tuple. */
function themeRGB(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const p = v.split(/\s+/).map((x) => parseInt(x, 10))
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}
