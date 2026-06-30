import React from 'react'
import { X, Plus, GitBranch } from 'lucide-react'
import { useStore } from '../store/useStore'

export function TabBar(): React.JSX.Element {
  const tabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.repo?.path)
  const switchTab = useStore((s) => s.switchTab)
  const closeTab = useStore((s) => s.closeTab)
  const pickAndOpenRepo = useStore((s) => s.pickAndOpenRepo)

  return (
    <div className="flex items-stretch h-9 bg-app-bg border-b border-app-border shrink-0 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.path === activePath
        return (
          <div
            key={t.path}
            onClick={() => switchTab(t.path)}
            title={t.path}
            className={`group flex items-center gap-2 pl-3 pr-2 min-w-[130px] max-w-[220px] border-r border-app-border border-t-2 cursor-pointer select-none ${
              active
                ? 'bg-app-panel text-app-text border-t-app-accent'
                : 'bg-app-bg text-app-muted border-t-transparent hover:bg-app-hover'
            }`}
          >
            <GitBranch size={13} className={active ? 'text-app-accent' : 'text-app-muted'} />
            <span className="flex-1 truncate text-[12px]">{t.name}</span>
            <button
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.path)
              }}
              className="opacity-0 group-hover:opacity-100 text-app-muted hover:text-app-danger rounded p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
      <button
        title="Open another repository"
        onClick={pickAndOpenRepo}
        className="flex items-center justify-center w-9 shrink-0 text-app-muted hover:text-app-text hover:bg-app-hover"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}
