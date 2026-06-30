/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(${name}) / <alpha-value>)`

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Map to CSS variables (RGB channels) so the whole theme can be
        // re-skinned from one place — see src/renderer/src/branding.ts.
        app: {
          bg: v('--app-bg'),
          panel: v('--app-panel'),
          'panel-2': v('--app-panel-2'),
          border: v('--app-border'),
          text: v('--app-text'),
          muted: v('--app-muted'),
          accent: v('--app-accent'),
          'accent-fg': v('--app-accent-fg'),
          hover: v('--app-hover'),
          danger: v('--app-danger'),
          success: v('--app-success'),
          warning: v('--app-warning')
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace']
      }
    }
  },
  plugins: []
}
