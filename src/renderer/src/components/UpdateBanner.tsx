import React from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button, IconButton, Spinner } from './ui'

/**
 * A thin bar shown when a newer release is available on GitHub. Downloads the
 * installer for the current OS directly, can re-check on demand, and can be
 * dismissed (a later re-check re-shows it while still outdated).
 */
export function UpdateBanner(): React.JSX.Element | null {
  const update = useStore((s) => s.update)
  const downloading = useStore((s) => s.updateDownloading)
  const downloadUpdate = useStore((s) => s.downloadUpdate)
  const dismissUpdate = useStore((s) => s.dismissUpdate)
  const checkForUpdate = useStore((s) => s.checkForUpdate)

  if (!update) return null

  return (
    <div className="shrink-0 flex items-center gap-3 h-10 px-4 bg-app-accent/15 border-b border-app-accent/40 text-[13px]">
      <Download size={15} className="text-app-accent shrink-0" />
      <span className="text-app-text truncate">
        Version <b>{update.version}</b> is available{' '}
        <span className="text-app-muted">(you're on {update.current})</span>
      </span>
      <div className="flex-1" />
      <Button variant="primary" onClick={() => downloadUpdate()} disabled={downloading}>
        {downloading ? <Spinner size={14} /> : <Download size={14} />}
        {downloading ? 'Downloading…' : update.assetUrl ? 'Download' : 'Open release'}
      </Button>
      <IconButton title="Check again" onClick={() => checkForUpdate()}>
        <RefreshCw size={15} />
      </IconButton>
      <IconButton title="Dismiss" onClick={dismissUpdate}>
        <X size={15} />
      </IconButton>
    </div>
  )
}
