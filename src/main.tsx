import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@/styles/index.css'
import { App } from '@/App'
import { installAudioUnlock } from '@/sound'
import { ErrorBoundary } from '@/ui/components/shell/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('No se encontró el elemento #root')

// Mismo base que tableLink() (import.meta.env.BASE_URL) para que los enlaces compartidos coincidan.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

// Desde el arranque: el gesto en el inicio (crear o unirse) ya sirve para desbloquear el audio de la mesa.
installAudioUnlock()

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
