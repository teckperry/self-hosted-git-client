import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { CommitGraph } from './components/CommitGraph'
import { ConflictBar } from './components/ConflictBar'
import { MergeResolver } from './components/MergeResolver'
import { DiffEditor } from './components/DiffEditor'
import { DetailPanel } from './components/DetailPanel'
import { ChangesPanel } from './components/ChangesPanel'
import { StatusBar } from './components/StatusBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import { SshManager } from './components/SshManager'
import { SettingsModal } from './components/SettingsModal'
import { Toast } from './components/Toast'
import { UpdateBanner } from './components/UpdateBanner'
import { SearchBar } from './components/SearchBar'

export default function App(): React.JSX.Element {
  const repo = useStore((s) => s.repo)
  const selection = useStore((s) => s.selection)
  const editorOpen = useStore((s) => s.editorOpen)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const loadRecent = useStore((s) => s.loadRecent)
  const restoreSession = useStore((s) => s.restoreSession)
  const checkForUpdate = useStore((s) => s.checkForUpdate)
  const autoFetch = useStore((s) => s.autoFetch)
  const autoFetchMinutes = useStore((s) => s.autoFetchMinutes)
  const resolveFile = useStore((s) => s.resolveFile)
  const closeResolve = useStore((s) => s.closeResolve)
  const [sshOpen, setSshOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rightWidth, setRightWidth] = useState(504)
  const dragging = useRef(false)
  const sshOpenRef = useRef(sshOpen)
  sshOpenRef.current = sshOpen

  useEffect(() => {
    loadRecent()
    restoreSession()
  }, [loadRecent, restoreSession])

  // Check for a newer release on startup, then periodically (every 6h).
  useEffect(() => {
    checkForUpdate()
    const id = setInterval(() => checkForUpdate(), 6 * 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [checkForUpdate])

  // The moment the app is looked at again (focus / becomes visible), sync:
  // refresh the local state (external git commands, in-progress merges…) and
  // fetch from the remote (throttled inside autoFetch).
  useEffect(() => {
    const onFocus = (): void => {
      const s = useStore.getState()
      if (s.repo && !s.busy) void s.autoFetch()
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') onFocus()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Keep the open repo in sync with its remote: fetch when a repo is opened or
  // switched to, then on the configured interval while the app sits in the
  // background. A 0-minute interval disables the remote fetch.
  const repoPath = repo?.path
  useEffect(() => {
    if (!repoPath) return
    autoFetch()
    if (autoFetchMinutes <= 0) return
    const id = setInterval(() => autoFetch(), autoFetchMinutes * 60 * 1000)
    return () => clearInterval(id)
  }, [repoPath, autoFetch, autoFetchMinutes])

  // Global arrow-key navigation: ↑/↓ move within the focused list,
  // ←/→ switch focus between the commit list and the file list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Cmd/Ctrl+F opens search (globally, even while typing). When the diff
      // editor is open it searches the code; otherwise it searches commits.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        const s = useStore.getState()
        if (s.repo) {
          e.preventDefault()
          if (s.editorOpen) s.openEditorSearch()
          else s.openSearch()
        }
        return
      }
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
      <TitleBar onOpenSsh={() => setSshOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
      <UpdateBanner />

      {repo ? (
        <>
          <TabBar />
          <Toolbar />
          <ConflictBar />
          <div className="flex-1 flex min-h-0">
            {sidebarOpen && <Sidebar />}
            <main className="flex-1 min-w-0 border-r border-app-border">
              {editorOpen ? <DiffEditor /> : <CommitGraph />}
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {resolveFile && <MergeResolver file={resolveFile} onClose={closeResolve} />}
      <SearchBar />
      <Toast />
    </div>
  )
}
