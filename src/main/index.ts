import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'

const isDev = !app.isPackaged

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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open external links in the user's default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

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
