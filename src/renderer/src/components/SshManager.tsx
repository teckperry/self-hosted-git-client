import React, { useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2, Copy, Check, X } from 'lucide-react'
import { api, call } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { Button, Input, Spinner, IconButton } from './ui'
import { ConfirmModal } from './PromptModal'
import type { SshKey, GenerateSshKeyOptions } from '@shared/types'

export function SshManager({ onClose }: { onClose: () => void }): React.JSX.Element {
  const showToast = useStore((s) => s.showToast)
  const [keys, setKeys] = useState<SshKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<SshKey | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      setKeys(await call(api.listSshKeys()))
    } catch (e) {
      showToast({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copyKey = (k: SshKey): void => {
    navigator.clipboard.writeText(k.publicKey)
    setCopied(k.name)
    setTimeout(() => setCopied((c) => (c === k.name ? null : c)), 2000)
  }

  return (
    <div className="fixed inset-0 z-40 bg-app-bg flex flex-col">
      <header className="flex items-center gap-2 h-12 px-4 border-b border-app-border shrink-0">
        <KeyRound size={18} className="text-app-accent" />
        <h1 className="font-semibold text-app-text">SSH keys</h1>
        <div className="flex-1" />
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          <Plus size={15} /> New key
        </Button>
        <IconButton title="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-[12px] text-app-muted mb-4">
            Keys are read from and created in <span className="font-mono">~/.ssh</span>. Copy the
            public key and add it to your Git hosting provider to authenticate over SSH.
          </p>

          {showForm && <GenerateForm onClose={() => setShowForm(false)} onDone={reload} />}

          {loading ? (
            <div className="flex items-center gap-2 text-app-muted py-8 justify-center">
              <Spinner /> Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center text-app-muted py-12 text-[13px]">
              No SSH keys found. Create one with “New key”.
            </div>
          ) : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li key={k.name} className="p-3 rounded-lg bg-app-panel border border-app-border">
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} className="text-app-accent shrink-0" />
                    <span className="font-semibold text-app-text">{k.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-app-panel-2 text-[10px] text-app-muted uppercase">
                      {k.type.replace('ssh-', '')}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => copyKey(k)}
                      className="flex items-center gap-1 text-[12px] text-app-muted hover:text-app-text"
                    >
                      {copied === k.name ? (
                        <>
                          <Check size={13} className="text-app-success" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={13} /> Copy public
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setToDelete(k)}
                      title="Delete"
                      className="text-app-muted hover:text-app-danger p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {k.comment && <div className="text-[12px] text-app-muted mt-1">{k.comment}</div>}
                  {k.fingerprint && (
                    <div className="text-[11px] font-mono text-app-muted mt-1">{k.fingerprint}</div>
                  )}
                  <div className="mt-2 text-[11px] font-mono text-app-text/70 bg-app-bg rounded p-2 break-all selectable max-h-20 overflow-auto">
                    {k.publicKey}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {toDelete && (
        <ConfirmModal
          title="Delete SSH key"
          message={`Delete the key "${toDelete.name}" (private and public) from ~/.ssh? This cannot be undone.`}
          danger
          confirmText="Delete"
          onConfirm={async () => {
            try {
              await call(api.deleteSshKey(toDelete.name))
              showToast({ kind: 'success', message: 'Key deleted' })
              reload()
            } catch (e) {
              showToast({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
            }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  )
}

function GenerateForm({
  onClose,
  onDone
}: {
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const showToast = useStore((s) => s.showToast)
  const [fileName, setFileName] = useState('id_ed25519')
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [comment, setComment] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [generating, setGenerating] = useState(false)

  const generate = async (): Promise<void> => {
    if (!fileName.trim()) return
    setGenerating(true)
    try {
      const opts: GenerateSshKeyOptions = {
        fileName: fileName.trim(),
        type,
        comment: comment.trim(),
        passphrase
      }
      await call(api.generateSshKey(opts))
      showToast({ kind: 'success', message: `Key "${fileName}" created` })
      onDone()
      onClose()
    } catch (e) {
      showToast({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mb-4 p-4 rounded-lg bg-app-panel border border-app-border">
      <h3 className="font-semibold text-app-text mb-3">Generate new SSH key</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[12px] text-app-muted mb-1">File name</span>
          <Input
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value)
            }}
            placeholder="id_ed25519"
          />
        </label>
        <label className="block">
          <span className="block text-[12px] text-app-muted mb-1">Type</span>
          <select
            value={type}
            onChange={(e) => {
              const t = e.target.value as 'ed25519' | 'rsa'
              setType(t)
              setFileName((f) => (f === 'id_ed25519' || f === 'id_rsa' ? `id_${t}` : f))
            }}
            className="w-full h-9 px-2 rounded-md bg-app-bg border border-app-border text-app-text outline-none focus:border-app-accent"
          >
            <option value="ed25519">ED25519 (recommended)</option>
            <option value="rsa">RSA 4096</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[12px] text-app-muted mb-1">Comment (e.g. email)</span>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="block text-[12px] text-app-muted mb-1">Passphrase (optional)</span>
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="leave empty for none"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={generate} disabled={!fileName.trim() || generating}>
          {generating ? <Spinner /> : <KeyRound size={15} />} Generate
        </Button>
      </div>
    </div>
  )
}
