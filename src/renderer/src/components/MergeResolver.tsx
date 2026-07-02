import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Check, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api, call } from '../lib/ipc'
import { Button, Spinner } from './ui'
import {
  parseConflicts,
  conflictCount,
  assembleResult,
  type MergePart,
  type Choice
} from '../lib/conflicts'

type Tone = 'normal' | 'ours' | 'theirs' | 'unresolved'

interface Row {
  type: 'code' | 'marker'
  num: number | null
  text: string
  tone: Tone
  /** conflict index this row belongs to (for click-to-toggle), or null */
  ci: number | null
  chosen?: boolean
}

/**
 * Three-pane merge editor for a single conflicted file. OURS (left) and THEIRS
 * (right) on top, the assembled RESULT below — each pane a code view with line
 * numbers and a minimap, all three scrolling together. Conflict hunks are
 * toggled per side (click a highlighted block to keep it); the result updates
 * live. Saving writes the file and stages it.
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
  const [choices, setChoices] = useState<Choice[]>([])

  useEffect(() => {
    if (!repoPath) return
    let alive = true
    call(api.readConflictText(repoPath, file))
      .then((text) => {
        if (!alive) return
        const p = parseConflicts(text)
        setParts(p)
        setChoices(Array.from({ length: conflictCount(p) }, () => ({ ours: false, theirs: false })))
      })
      .catch(() => alive && setParts([]))
    return () => {
      alive = false
    }
  }, [repoPath, file])

  const result = useMemo(
    () => (parts ? assembleResult(parts, choices) : { text: '', unresolved: 0 }),
    [parts, choices]
  )
  const total = choices.length
  const toggle = useCallback(
    (ci: number, side: 'ours' | 'theirs'): void =>
      setChoices((prev) => prev.map((c, i) => (i === ci ? { ...c, [side]: !c[side] } : c))),
    []
  )

  // Rows for each pane (line numbers reflect each side's own file / the result).
  const oursRows = useMemo(() => (parts ? sideRows(parts, choices, 'ours') : []), [parts, choices])
  const theirsRows = useMemo(() => (parts ? sideRows(parts, choices, 'theirs') : []), [parts, choices])
  const resultRows = useMemo(() => (parts ? buildResultRows(parts, choices) : []), [parts, choices])

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
          {total} conflict{total === 1 ? '' : 's'}
          {result.unresolved > 0 ? ` · ${result.unresolved} unresolved` : ' · all resolved'}
        </span>
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !parts || result.unresolved > 0}
          title={result.unresolved > 0 ? 'Pick a side for every conflict first' : 'Save and stage'}
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
          {/* top: ours | theirs */}
          <div className="flex-1 min-h-0 flex">
            <MergePane
              title="Ours (current)"
              rows={oursRows}
              scrollRef={oursRef}
              onScroll={() => mirror(oursRef)}
              onToggle={(ci) => toggle(ci, 'ours')}
            />
            <div className="w-px bg-app-border shrink-0" />
            <MergePane
              title="Theirs (incoming)"
              rows={theirsRows}
              scrollRef={theirsRef}
              onScroll={() => mirror(theirsRef)}
              onToggle={(ci) => toggle(ci, 'theirs')}
            />
          </div>
          {/* bottom: result */}
          <div className="h-[38%] min-h-[120px] border-t border-app-border flex flex-col">
            <MergePane title="Result" rows={resultRows} scrollRef={resultRef} onScroll={() => mirror(resultRef)} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Build the rows for the ours/theirs pane: full file from that side. */
function sideRows(parts: MergePart[], choices: Choice[], side: 'ours' | 'theirs'): Row[] {
  const rows: Row[] = []
  let ln = 0
  let ci = -1
  for (const p of parts) {
    if (p.kind === 'context') {
      for (const l of p.lines) rows.push({ type: 'code', num: ++ln, text: l, tone: 'normal', ci: null })
    } else {
      ci++
      const chosen = choices[ci]?.[side] ?? false
      const lines = side === 'ours' ? p.ours : p.theirs
      rows.push({
        type: 'marker',
        num: null,
        text: `Conflict ${ci + 1} · ${side}${lines.length === 0 ? ' (empty)' : ''}`,
        tone: side,
        ci,
        chosen
      })
      for (const l of lines) rows.push({ type: 'code', num: ++ln, text: l, tone: side, ci, chosen })
    }
  }
  return rows
}

/** Build the rows for the result pane from the current choices. */
function buildResultRows(parts: MergePart[], choices: Choice[]): Row[] {
  const rows: Row[] = []
  let ln = 0
  let ci = -1
  for (const p of parts) {
    if (p.kind === 'context') {
      for (const l of p.lines) rows.push({ type: 'code', num: ++ln, text: l, tone: 'normal', ci: null })
    } else {
      ci++
      const ch = choices[ci] ?? { ours: false, theirs: false }
      if (!ch.ours && !ch.theirs) {
        rows.push({ type: 'marker', num: null, text: `Conflict ${ci + 1} — unresolved`, tone: 'unresolved', ci: null })
      } else {
        if (ch.ours) for (const l of p.ours) rows.push({ type: 'code', num: ++ln, text: l, tone: 'ours', ci: null })
        if (ch.theirs) for (const l of p.theirs) rows.push({ type: 'code', num: ++ln, text: l, tone: 'theirs', ci: null })
      }
    }
  }
  return rows
}

function toneClass(tone: Tone, chosen?: boolean): string {
  if (tone === 'ours') return chosen ? 'bg-app-success/15' : 'bg-app-success/5'
  if (tone === 'theirs') return chosen ? 'bg-app-accent/15' : 'bg-app-accent/5'
  if (tone === 'unresolved') return 'bg-app-warning/15 text-app-warning'
  return ''
}

function MergePane({
  title,
  rows,
  scrollRef,
  onScroll,
  onToggle
}: {
  title: string
  rows: Row[]
  scrollRef: React.RefObject<HTMLDivElement>
  onScroll: () => void
  onToggle?: (ci: number) => void
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
                const clickable = r.ci != null && !!onToggle
                const bg = toneClass(r.tone, r.chosen)
                return (
                  <tr
                    key={i}
                    onClick={clickable ? () => onToggle!(r.ci as number) : undefined}
                    className={`${bg} ${clickable ? 'cursor-pointer hover:brightness-110' : ''}`}
                  >
                    <td className="w-10 px-2 text-right text-app-muted/50 select-none align-top border-r border-app-border">
                      {r.num ?? ''}
                    </td>
                    {r.type === 'marker' ? (
                      <td className="pl-2 pr-3 whitespace-pre align-top text-[10px] uppercase tracking-wide">
                        <span className="inline-flex items-center gap-1">
                          {r.chosen != null && (
                            <span
                              className={`inline-flex items-center justify-center w-3 h-3 rounded-[3px] border ${
                                r.tone === 'ours' ? 'border-app-success' : 'border-app-accent'
                              } ${
                                r.chosen
                                  ? r.tone === 'ours'
                                    ? 'bg-app-success text-app-accent-fg'
                                    : 'bg-app-accent text-app-accent-fg'
                                  : ''
                              }`}
                            >
                              {r.chosen && <Check size={9} />}
                            </span>
                          )}
                          {r.text}
                          {r.chosen != null && <span className="text-app-muted normal-case">— click to {r.chosen ? 'remove' : 'keep'}</span>}
                        </span>
                      </td>
                    ) : (
                      <td className="pl-2 pr-3 whitespace-pre align-top selectable text-app-text/90">
                        {r.text === '' ? ' ' : r.text}
                      </td>
                    )}
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

/** A tiny overview of a pane's lines with a viewport box; click/drag to scrub. */
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
      if (r.tone === 'ours') ctx.fillStyle = `rgba(${su[0]},${su[1]},${su[2]},0.8)`
      else if (r.tone === 'theirs') ctx.fillStyle = `rgba(${ac[0]},${ac[1]},${ac[2]},0.8)`
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
