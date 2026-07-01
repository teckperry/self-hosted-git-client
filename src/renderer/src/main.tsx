import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyBranding } from './branding'
import { loadPrefs } from './lib/prefs'
import './styles/globals.css'

applyBranding(loadPrefs().theme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
