import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_APP_CONFIG } from '@shared/types'
import App from './App'

// Apply saved theme before first paint to prevent flash
try {
  const raw = localStorage.getItem('timmy-theme')
  const theme = raw ?? DEFAULT_APP_CONFIG.theme
  document.documentElement.setAttribute('data-theme', theme)
} catch {
  // ignore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
