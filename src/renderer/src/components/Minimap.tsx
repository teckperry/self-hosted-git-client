import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DiffFile } from '@shared/types'

const MINIMAP_W = 104

/**
 * A tiny overview of the whole file drawn on a canvas: each line is a bar,
 * additions green / deletions red / context faint. A translucent box marks the
 * portion currently visible in the editor, and clicking or dragging scrubs the
 * editor's scroll position.
 */
export function Minimap({
  file,
  scrollRef
}: {
  file: DiffFile
  scrollRef: React.RefObject<HTMLDivElement>
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [vp, setVp] = useState({ top: 0, height: 1 })

  const lines = useMemo(() => file.hunks.flatMap((h) => h.lines), [file])

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

    const n = lines.length || 1
    const rowH = H / n
    const barH = Math.max(1, Math.min(rowH, 2))
    const [sr, sg, sb] = themeRGB('--app-success')
    const [dr, dg, db] = themeRGB('--app-danger')
    const [mr, mg, mb] = themeRGB('--app-muted')

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      const len = ln.content.replace(/\t/g, '    ').trimEnd().length
      if (ln.type === 'add') ctx.fillStyle = `rgba(${sr},${sg},${sb},0.85)`
      else if (ln.type === 'del') ctx.fillStyle = `rgba(${dr},${dg},${db},0.85)`
      else {
        if (len === 0) continue
        ctx.fillStyle = `rgba(${mr},${mg},${mb},0.28)`
      }
      const w = Math.max(2, Math.min(W - 8, len * 0.85))
      ctx.fillRect(4, i * rowH, w, barH)
    }
  }, [lines])

  // Redraw on file change and whenever the strip is resized.
  useEffect(() => {
    draw()
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [draw])

  // Track which slice of the file is visible in the editor.
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
  }, [scrollRef, file])

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
