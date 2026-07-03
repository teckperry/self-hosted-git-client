import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { api, call } from '../lib/ipc'
import { branding } from '../branding'
import { Modal, Button, Input, Field } from './ui'

const FETCH_OPTIONS = [0, 1, 3, 5, 10, 30]

/**
 * App settings: appearance, background-sync cadence and the git identity for
 * the current repository. Preferences persist locally; identity is written to
 * the repo's git config.
 */
export function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const autoFetchMinutes = useStore((s) => s.autoFetchMinutes)
  const setAutoFetchMinutes = useStore((s) => s.setAutoFetchMinutes)
  const defaultDiffView = useStore((s) => s.defaultDiffView)
  const setDefaultDiffView = useStore((s) => s.setDefaultDiffView)
  const repo = useStore((s) => s.repo)
  const showToast = useStore((s) => s.showToast)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [savingIdentity, setSavingIdentity] = useState(false)

  // Load the current repo's git identity when the panel opens.
  useEffect(() => {
    if (!repo) return
    let alive = true
    call(api.getUserConfig(repo.path))
      .then((cfg) => {
        if (!alive) return
        setName(cfg.name)
        setEmail(cfg.email)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [repo])

  const saveIdentity = async (): Promise<void> => {
    if (!repo) return
    setSavingIdentity(true)
    try {
      await call(api.setUserConfig(repo.path, name.trim(), email.trim()))
      showToast({ kind: 'success', message: 'Git identity saved' })
    } catch {
      showToast({ kind: 'error', message: 'Could not save the git identity' })
    } finally {
      setSavingIdentity(false)
    }
  }

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      {/* Appearance */}
      <Field label="Appearance">
        <div className="inline-flex rounded-md border border-app-border overflow-hidden text-[13px]">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-3 h-9 capitalize transition-colors ${
                theme === t
                  ? 'bg-app-accent text-app-accent-fg'
                  : 'text-app-muted hover:bg-app-hover hover:text-app-text'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      {/* Auto-fetch */}
      <Field label="Auto-fetch from remote">
        <div className="flex flex-wrap gap-1.5">
          {FETCH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setAutoFetchMinutes(m)}
              className={`px-2.5 h-8 rounded-md border text-[12px] transition-colors ${
                autoFetchMinutes === m
                  ? 'border-app-accent bg-app-accent/15 text-app-text'
                  : 'border-app-border text-app-muted hover:bg-app-hover hover:text-app-text'
              }`}
            >
              {m === 0 ? 'Off' : `${m} min`}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-app-muted mt-1">
          How often the app quietly fetches while in the background. It also fetches the moment
          the window comes back into view and when you switch repos.
        </span>
      </Field>

      {/* Default diff view */}
      <Field label="Default diff view">
        <div className="inline-flex rounded-md border border-app-border overflow-hidden text-[13px]">
          {(['split', 'inline'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setDefaultDiffView(m)}
              className={`px-3 h-9 capitalize transition-colors ${
                defaultDiffView === m
                  ? 'bg-app-accent text-app-accent-fg'
                  : 'text-app-muted hover:bg-app-hover hover:text-app-text'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-app-muted mt-1">
          How the diff editor opens. You can still switch views inside the editor at any time.
        </span>
      </Field>

      {/* Git identity */}
      <div className="mt-4 pt-4 border-t border-app-border">
        <span className="block text-[12px] font-medium text-app-text mb-2">
          Git identity {repo ? `— ${repo.name}` : ''}
        </span>
        {repo ? (
          <>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" />
            </Field>
            <Field label="Email">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" onClick={saveIdentity} disabled={savingIdentity}>
                Save identity
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-app-muted">Open a repository to edit its git identity.</p>
        )}
      </div>

      <p className="mt-4 pt-3 border-t border-app-border text-[11px] text-app-muted">
        {branding.name} v{branding.version}
      </p>
    </Modal>
  )
}
