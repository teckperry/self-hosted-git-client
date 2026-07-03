import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { isSafeExternalUrl } from './security'

const isDev = !app.isPackaged

/** Same protocol + host — i.e. a navigation that stays inside the app itself. */
function isSameOrigin(a: string, b: string): boolean {
  try {
    const x = new URL(a)
    const y = new URL(b)
    return x.protocol === y.protocol && x.host === y.host
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the user's default browser — but only real web/mail
  // URLs, never file:// or custom protocols that could launch an OS handler.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window only ever shows the app's own content. Any attempt to navigate
  // the top frame elsewhere (a stray link, an injected redirect) is blocked;
  // safe web URLs are handed to the browser instead of loading in-app.
  win.webContents.on('will-navigate', (event, url) => {
    if (isSameOrigin(url, win.webContents.getURL())) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) shell.openExternal(url)
  })

  // We never embed <webview> — refuse any attempt to attach one.
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

/**
 * Screenshot mode — used to (re)generate the README/docs pictures against a
 * demo repository. Entirely env-guarded, does nothing in normal runs:
 *
 *   SCREENSHOT_REPO=/path/to/demo   seeds the session (see services/store.ts)
 *   SCREENSHOT_PATH=/out.png        capture target; enables the mode
 *   SCREENSHOT_KEYS=Down,Down       keys sent after load (drive the selection)
 *   SCREENSHOT_JS=<expression>      optional JS run in the page before capture
 *   SCREENSHOT_DELAY=2500           ms to let the repo load before the keys
 *
 * Example:
 *   SCREENSHOT_REPO=/tmp/demo SCREENSHOT_PATH=docs/screenshot.png \
 *     SCREENSHOT_KEYS=Down,Down npx electron out/main/index.js
 */
function setupScreenshotMode(win: BrowserWindow): void {
  const out = process.env.SCREENSHOT_PATH
  if (!out) return
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        for (const key of (process.env.SCREENSHOT_KEYS ?? '').split(',').filter(Boolean)) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
          await new Promise((r) => setTimeout(r, 450))
        }
        if (process.env.SCREENSHOT_JS) {
          const res = await win.webContents.executeJavaScript(process.env.SCREENSHOT_JS)
          if (res !== undefined) console.log('SCREENSHOT_JS →', JSON.stringify(res))
        }
        await new Promise((r) => setTimeout(r, 900))
        const image = await win.webContents.capturePage()
        await fs.writeFile(out, image.toPNG())
      } finally {
        app.quit()
      }
    }, Number(process.env.SCREENSHOT_DELAY ?? 2500))
  })
}

nativeTheme.themeSource = 'dark'

app.whenReady().then(() => {
  registerIpcHandlers()
  const win = createWindow()
  setupScreenshotMode(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
