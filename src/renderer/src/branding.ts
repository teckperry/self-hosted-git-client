// ===========================================================================
//  ⭐ BRANDING — THE SINGLE PLACE TO CHANGE THE APP'S IDENTITY ⭐
// ===========================================================================
//  Change the name, tagline and colors here. The rest of the interface reads
//  from this file (and the CSS variables generated at the bottom). Nothing
//  else needs to be touched to rebrand the application.
//
//  NOTE: the package/executable name lives in `package.json` and
//  `electron-builder.yml` (the "name" / "productName" / "appId" fields).
// ===========================================================================

export const branding = {
  /** Name shown everywhere in the interface. */
  name: 'Self-hosted Git Client',

  /** Subtitle/claim shown on the welcome screen. */
  tagline: 'Free, open and entirely yours',

  /** Version shown in the about section (keep it in sync with package.json). */
  version: '0.1.7',

  /**
   * Color theme. Intentionally a small set of semantic tokens: change them and
   * the whole UI adapts. They are injected as CSS variables (see applyBranding()).
   */
  theme: {
    dark: {
      bg: '#0d1117',
      panel: '#161b22',
      panel2: '#1c2230',
      border: '#30363d',
      text: '#e6edf3',
      muted: '#8b949e',
      accent: '#3b82f6',
      accentFg: '#ffffff',
      hover: '#21262d',
      danger: '#f85149',
      success: '#3fb950',
      warning: '#d29922'
    },
    light: {
      bg: '#ffffff',
      panel: '#f6f8fa',
      panel2: '#eef1f4',
      border: '#d0d7de',
      text: '#1f2328',
      muted: '#656d76',
      accent: '#2563eb',
      accentFg: '#ffffff',
      hover: '#eaeef2',
      danger: '#cf222e',
      success: '#1a7f37',
      warning: '#9a6700'
    }
  },

  /**
   * Palette used for branches in the commit graph. Add/reorder colors to change
   * the look of the tree. The order is the order in which lanes are assigned.
   */
  graphColors: [
    '#3b82f6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#a855f7',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
    '#f97316',
    '#14b8a6'
  ]
} as const

export type ThemeMode = 'dark' | 'light'

/** "#0d1117" -> "13 17 23" (space-separated RGB channels for Tailwind opacity). */
function hexToChannels(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

/**
 * Inject the chosen theme's colors as CSS variables on <html>, in RGB-channel
 * form ("r g b") so Tailwind opacity modifiers (e.g. bg-app-accent/15) work.
 * Use rgb(var(--app-x)) for the solid color.
 */
export function applyBranding(mode: ThemeMode = 'dark'): void {
  const t = branding.theme[mode]
  const root = document.documentElement
  const map: Record<string, string> = {
    '--app-bg': t.bg,
    '--app-panel': t.panel,
    '--app-panel-2': t.panel2,
    '--app-border': t.border,
    '--app-text': t.text,
    '--app-muted': t.muted,
    '--app-accent': t.accent,
    '--app-accent-fg': t.accentFg,
    '--app-hover': t.hover,
    '--app-danger': t.danger,
    '--app-success': t.success,
    '--app-warning': t.warning
  }
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, hexToChannels(v))
  root.dataset.theme = mode
  document.title = branding.name
}
