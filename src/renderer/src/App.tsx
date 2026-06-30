import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { CommitGraph } from './components/CommitGraph'
import { DetailPanel } from './components/DetailPanel'
import { ChangesPanel } from './components/ChangesPanel'
import { StatusBar } from './components/StatusBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SshManager } from './components/SshManager'
import { Toast } from './components/Toast'

export default function App(): React.JSX.Element {
  const repo = useStore((s) => s.repo)
  const selection = useStore((s) => s.selection)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const loadRecent = useStore((s) => s.loadRecent)
  const restoreSession = useStore((s) => s.restoreSession)
  const [sshOpen, setSshOpen] = useState(false)
  const [rightWidth, setRightWidth] = useState(560)
  const dragging = useRef(false)
  const sshOpenRef = useRef(sshOpen)
  sshOpenRef.current = sshOpen

  useEffect(() => {
    loadRecent()
    restoreSession()
  }, [loadRecent, restoreSession])

  // Global arrow-key navigation: ↑/↓ move within the focused list,
  // ←/→ switch focus between the commit list and the file list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (sshOpenRef.current) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const s = useStore.getState()
      if (!s.repo) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          if (s.focusZone === 'commits') s.navigateCommits(1)
          else s.navigateFiles(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          if (s.focusZone === 'commits') s.navigateCommits(-1)
          else s.navigateFiles(-1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.setFocusZone('commits')
          break
        case 'ArrowRight':
          e.preventDefault()
          s.setFocusZone('files')
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onMouseDown = useCallback(() => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const w = window.innerWidth - e.clientX
      setRightWidth(Math.min(Math.max(w, 360), window.innerWidth - 500))
    }
    const onUp = (): void => {
      dragging.current = false
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-app-bg text-app-text">
      <TitleBar onOpenSsh={() => setSshOpen(true)} />

      {repo ? (
        <>
          <TabBar />
          <Toolbar />
          <div className="flex-1 flex min-h-0">
            {sidebarOpen && <Sidebar />}
            <main className="flex-1 min-w-0 border-r border-app-border">
              <CommitGraph />
            </main>
            <div
              onMouseDown={onMouseDown}
              className="w-1 cursor-col-resize bg-transparent hover:bg-app-accent/50 transition-colors shrink-0"
            />
            <section
              style={{ width: rightWidth }}
              className="shrink-0 bg-app-panel overflow-hidden"
            >
              {selection?.type === 'wip' ? <ChangesPanel /> : <DetailPanel />}
            </section>
          </div>
          <StatusBar />
        </>
      ) : (
        <WelcomeScreen onOpenSsh={() => setSshOpen(true)} />
      )}

      {sshOpen && <SshManager onClose={() => setSshOpen(false)} />}
      <Toast />
    </div>
  )
}
