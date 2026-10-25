import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './app/auth'
import { ConnectionProvider } from './app/connection'
import { applyTheme, getStoredTheme } from './lib/theme'
import './styles/index.css'

applyTheme(getStoredTheme())
// Follow the system when the theme is "system".
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(getStoredTheme()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConnectionProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConnectionProvider>
    </BrowserRouter>
  </StrictMode>,
)
