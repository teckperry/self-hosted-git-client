import React from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useStore } from '../store/useStore'

export function Toast(): React.JSX.Element | null {
  const toast = useStore((s) => s.toast)
  const showToast = useStore((s) => s.showToast)
  if (!toast) return null

  const conf = {
    success: { icon: <CheckCircle2 size={16} className="text-app-success" />, border: 'border-app-success/50' },
    error: { icon: <AlertTriangle size={16} className="text-app-danger" />, border: 'border-app-danger/50' },
    info: { icon: <Info size={16} className="text-app-accent" />, border: 'border-app-accent/50' }
  }[toast.kind]

  return (
    <div className="fixed bottom-4 right-4 z-[70] max-w-md">
      <div
        className={`flex items-start gap-2 px-3 py-2.5 rounded-lg bg-app-panel border ${conf.border} shadow-2xl`}
      >
        <span className="mt-0.5 shrink-0">{conf.icon}</span>
        <span className="text-[13px] text-app-text whitespace-pre-wrap break-words selectable flex-1">
          {toast.message}
        </span>
        <button
          onClick={() => showToast(null)}
          className="text-app-muted hover:text-app-text shrink-0"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
