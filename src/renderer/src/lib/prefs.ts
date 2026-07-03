import type { ThemeMode } from '../branding'

/** User preferences persisted locally (renderer-side, survives restarts). */
export interface Prefs {
  theme: ThemeMode
  /** background auto-fetch interval in minutes; 0 disables it */
  autoFetchMinutes: number
  /** how the diff editor opens by default */
  defaultDiffView: 'inline' | 'split'
}

const KEY = 'app-prefs'
const DEFAULTS: Prefs = { theme: 'dark', autoFetchMinutes: 5, defaultDiffView: 'split' }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>
      return {
        theme: p.theme === 'light' ? 'light' : 'dark',
        autoFetchMinutes:
          typeof p.autoFetchMinutes === 'number' && p.autoFetchMinutes >= 0
            ? p.autoFetchMinutes
            : DEFAULTS.autoFetchMinutes,
        defaultDiffView: p.defaultDiffView === 'inline' ? 'inline' : 'split'
      }
    }
  } catch {
    /* corrupt/unavailable — fall back to defaults */
  }
  return { ...DEFAULTS }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable — preferences just won't persist */
  }
}
