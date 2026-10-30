import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { normalizeTableCode } from '@/lib/ids'
import { removeHostTable } from '@/net/hostStorage'
import { forgetTable } from '@/store/recentTables'
import { Button } from '@/ui/primitives'

interface ErrorBoundaryProps {
  children: ReactNode
}

/** Olvida la mesa de la URL actual (si hay) y carga el inicio de cero. */
function clearTableAndGoHome(): void {
  const raw = window.location.pathname.match(/\/t\/([^/]+)/)?.[1]
  if (raw) {
    try {
      const code = normalizeTableCode(raw)
      removeHostTable(code)
      forgetTable(code)
    } catch {
      /* sin almacenamiento disponible: basta con salir de la mesa */
    }
  }
  window.location.assign(import.meta.env.BASE_URL)
}

/**
 * Último recurso ante un error de render: sin esto React desmonta la app y deja la pantalla en blanco.
 * Sale con una recarga completa porque el estado en memoria puede ser justo lo que falló.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main role="alert" className="flex min-h-dvh items-center justify-center p-4">
        <div className="glass w-full max-w-sm rounded-2xl p-6 text-center shadow-panel">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert className="size-7" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Algo salió mal</h1>
          <p className="mt-2 text-sm text-ink-2">
            Prueba a recargar. Si el error se repite, vuelve al inicio: se borrará la copia guardada de esta mesa en
            este navegador.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => window.location.reload()}>Recargar</Button>
            <Button variant="secondary" onClick={clearTableAndGoHome}>
              Volver al inicio y limpiar la mesa
            </Button>
          </div>
        </div>
      </main>
    )
  }
}
