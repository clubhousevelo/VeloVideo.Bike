import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'

function mount() {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    document.body.innerHTML = '<div style="padding:2rem;font-family:system-ui;color:#e11d48;">Root element #root not found.</div>'
    return
  }
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : ''
    rootEl.innerHTML = `<div style="padding:2rem;font-family:monospace;white-space:pre-wrap;color:#e11d48;">Failed to mount: ${msg}\n\n${stack}</div>`
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
