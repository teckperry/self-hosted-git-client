import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

type BtnVariant = 'primary' | 'default' | 'ghost' | 'danger'

export function Button({
  variant = 'default',
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }): React.JSX.Element {
  const base =
    'no-drag inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none whitespace-nowrap'
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-app-accent text-app-accent-fg hover:opacity-90',
    default: 'bg-app-panel-2 text-app-text hover:bg-app-hover border border-app-border',
    ghost: 'text-app-text hover:bg-app-hover',
    danger: 'bg-app-danger text-white hover:opacity-90'
  }
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

export function IconButton({
  className = '',
  title,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      title={title}
      className={`no-drag inline-flex items-center justify-center w-8 h-8 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Spinner({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-app-border border-t-app-accent"
      style={{ width: size, height: size }}
    />
  )
}

export function Modal({
  title,
  onClose,
  children,
  width = 460
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="bg-app-panel border border-app-border rounded-xl shadow-2xl overflow-hidden"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-app-border">
          <h2 className="font-semibold text-app-text">{title}</h2>
          <IconButton title="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="block mb-3">
      <span className="block text-[12px] text-app-muted mb-1">{label}</span>
      {children}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      {...props}
      className={`selectable w-full h-9 px-3 rounded-md bg-app-bg border border-app-border text-app-text outline-none focus:border-app-accent transition-colors ${props.className ?? ''}`}
    />
  )
}

/** A lightweight right-click context menu. */
export interface MenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
}

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // keep menu on-screen
  const style: React.CSSProperties = { left: x, top: y }
  return (
    <div
      ref={ref}
      className="fixed z-[60] min-w-[180px] py-1 bg-app-panel border border-app-border rounded-md shadow-2xl"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-app-border" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.onClick()
            }}
            className={`block w-full text-left px-3 py-1.5 text-[13px] hover:bg-app-hover disabled:opacity-40 disabled:hover:bg-transparent ${
              it.danger ? 'text-app-danger' : 'text-app-text'
            }`}
          >
            {it.label}
          </button>
        )
      )}
    </div>
  )
}

/** Hook to manage context-menu state. */
export function useContextMenu(): {
  menu: { x: number; y: number; items: MenuItem[] } | null
  open: (e: React.MouseEvent, items: MenuItem[]) => void
  close: () => void
} {
  const [menu, setMenu] = React.useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  return {
    menu,
    open: (e, items) => {
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, items })
    },
    close: () => setMenu(null)
  }
}
