import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import pkg from '../../../package.json'
import type { UpdateInfo } from '@shared/types'

// The GitHub "owner/repo" that publishes the releases. Derived from
// package.json's `repository` field — the same field electron-builder uses to
// publish — so a rebrand or fork only has to change that one place, never this
// file. The import is inlined at build time (no runtime file lookup), and a
// fallback keeps things working if the field is ever missing/unparseable.
const FALLBACK_REPO = 'teckperry/self-hosted-git-client'

function parseRepoSlug(repository: unknown): string | null {
  const url = typeof repository === 'string' ? repository : (repository as { url?: string })?.url
  if (!url) return null
  // Accept https://github.com/owner/repo(.git), git@github.com:owner/repo(.git),
  // the npm "github:owner/repo" shorthand and a bare "owner/repo".
  const m =
    url.match(/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?(?:[#/].*)?$/i) ||
    url.match(/^(?:github:)?([^/\s]+\/[^/\s]+?)(?:\.git)?$/)
  return m ? m[1] : null
}

const RELEASE_REPO = parseRepoSlug((pkg as { repository?: unknown }).repository) ?? FALLBACK_REPO

interface GhAsset {
  name: string
  browser_download_url: string
}

/** Pick the installer asset that matches the current OS. */
function pickAsset(assets: GhAsset[]): { name: string; url: string } | null {
  const ext =
    process.platform === 'darwin' ? '.dmg' : process.platform === 'win32' ? '.exe' : '.appimage'
  const a = assets.find((x) => x.name.toLowerCase().endsWith(ext))
  return a ? { name: a.name, url: a.browser_download_url } : null
}

/** Compare dotted versions: is `latest` strictly newer than `current`? */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return false
}

export const updateService = {
  /** Returns update info only when a newer published release exists, else null. */
  async check(): Promise<UpdateInfo | null> {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { 'User-Agent': app.getName(), Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string; html_url?: string; assets?: GhAsset[] }
    const latest = String(data.tag_name || '').trim()
    const current = app.getVersion()
    if (!latest || !isNewer(latest, current)) return null
    const asset = pickAsset(data.assets || [])
    return {
      version: latest.replace(/^v/, ''),
      current,
      releaseUrl: data.html_url || `https://github.com/${RELEASE_REPO}/releases/latest`,
      assetUrl: asset?.url ?? null,
      assetName: asset?.name ?? null
    }
  },

  /** Download an asset to the user's Downloads folder and reveal it. */
  async download(url: string): Promise<string> {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('No window available for download.')
    const savePath = await new Promise<string>((resolve, reject) => {
      const ses = win.webContents.session
      const onWillDownload = (_e: Electron.Event, item: Electron.DownloadItem): void => {
        ses.removeListener('will-download', onWillDownload)
        const target = join(app.getPath('downloads'), item.getFilename())
        item.setSavePath(target)
        item.once('done', (_ev, state) => {
          if (state === 'completed') resolve(target)
          else reject(new Error(`Download ${state}`))
        })
      }
      ses.on('will-download', onWillDownload)
      win.webContents.downloadURL(url)
    })
    shell.showItemInFolder(savePath)
    return savePath
  }
}
