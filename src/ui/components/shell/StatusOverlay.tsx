import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Ban, DoorClosed, LoaderCircle, RefreshCw, TriangleAlert, Unplug, WifiOff } from 'lucide-react'
import type { ConnectionStatus } from '@/net/protocol'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/primitives'

export interface StatusOverlayProps {
  status: ConnectionStatus
  code: string
  /** Mensaje del último error de transporte (para status 'error'). */
  errorMessage?: string | null
  onHome: () => void
  onRetry?: () => void
}

type Tone = 'neutral' | 'warn' | 'danger'

interface Content {
  key: string
  icon: ReactNode
  title: string
  description?: string
  tone: Tone
  busy?: boolean
  retry?: boolean
  home?: boolean
}

const toneRing: Record<Tone, string> = {
  neutral: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

function contentFor(status: ConnectionStatus, code: string, errorMessage?: string | null): Content | null {
  switch (status) {
    case 'idle':
    case 'connecting':
      return {
        key: 'connecting',
        icon: <LoaderCircle className="size-7 animate-spin" strokeWidth={1.75} aria-hidden />,
        title: 'Conectando a la mesa…',
        description: `Mesa ${code}`,
        tone: 'neutral',
        busy: true,
      }
    case 'not-found':
      return {
        key: 'not-found',
        icon: <Unplug className="size-7" strokeWidth={1.75} aria-hidden />,
        title: 'Esta mesa no existe o el anfitrión no está conectado',
        description:
          'Pide a quien creó la mesa que vuelva a abrir su enlace. Si eres tú, entra desde el navegador donde la creaste para reanudarla.',
        tone: 'warn',
        retry: true,
        home: true,
      }
    case 'kicked':
      return {
        key: 'kicked',
        icon: <Ban className="size-7" strokeWidth={1.75} aria-hidden />,
        title: 'Te expulsaron de la mesa',
        description: 'Un admin te sacó de la mesa. No puedes volver a entrar con este enlace.',
        tone: 'danger',
        home: true,
      }
    case 'closed':
      return {
        key: 'closed',
        icon: <DoorClosed className="size-7" strokeWidth={1.75} aria-hidden />,
        title: 'La mesa fue cerrada',
        description: 'El anfitrión cerró la mesa. Puedes crear una nueva desde el inicio.',
        tone: 'neutral',
        home: true,
      }
    case 'error':
      return {
        key: 'error',
        icon: <TriangleAlert className="size-7" strokeWidth={1.75} aria-hidden />,
        title: 'Algo salió mal',
        description: errorMessage || 'No pudimos conectar con la mesa. Revisa tu conexión e inténtalo de nuevo.',
        tone: 'danger',
        retry: true,
        home: true,
      }
    case 'connected':
    case 'reconnecting':
      return null
  }
}

/** Cubre la columna principal según el estado de conexión (no cubre el panel lateral). */
export function StatusOverlay({ status, code, errorMessage, onHome, onRetry }: StatusOverlayProps) {
  const reduce = useReducedMotion() ?? false
  const content = contentFor(status, code, errorMessage)
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // Con acciones el overlay bloquea la mesa (que queda inerte): el foco pasa a su primer botón.
  const actionable = !!content && (!!content.home || !!content.retry)
  const actionableKey = actionable ? content.key : null
  useEffect(() => {
    if (actionableKey) panelRef.current?.querySelector('button')?.focus()
  }, [actionableKey])

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          key={content.key}
          className="absolute inset-0 z-20 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          {...(actionable
            ? {
                role: 'alertdialog',
                'aria-labelledby': titleId,
                'aria-describedby': content.description ? descriptionId : undefined,
              }
            : { role: 'status', 'aria-live': 'polite' as const, 'aria-busy': content.busy })}
        >
          <motion.div
            ref={panelRef}
            className="glass w-full max-w-sm rounded-2xl p-6 text-center shadow-panel"
            initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          >
            <div className={cn('mx-auto mb-4 flex size-14 items-center justify-center rounded-full', toneRing[content.tone])}>
              {content.icon}
            </div>
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
              {content.title}
            </h2>
            {content.description && (
              <p id={descriptionId} className="mt-2 text-sm text-ink-2">
                {content.description}
              </p>
            )}
            {(content.retry || content.home) && (
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
                {content.home && (
                  <Button variant="secondary" icon={<ArrowLeft className="size-4" strokeWidth={1.75} />} onClick={onHome}>
                    Volver al inicio
                  </Button>
                )}
                {content.retry && onRetry && (
                  <Button icon={<RefreshCw className="size-4" strokeWidth={1.75} />} onClick={onRetry}>
                    Reintentar
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Banner ámbar en flujo, sobre la columna principal: empuja el contenido, no tapa la mesa. */
export function ReconnectBanner({ visible }: { visible: boolean }) {
  const reduce = useReducedMotion() ?? false
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="reconnecting"
          className="shrink-0 overflow-hidden"
          initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          <div
            role="alert"
            className={cn(
              'flex items-center justify-center gap-2 border-b border-warn/40 bg-warn/15',
              'px-4 py-2 text-sm font-semibold text-warn',
            )}
          >
            <WifiOff className="size-4" strokeWidth={1.75} aria-hidden />
            <span>Se perdió la conexión. Reintentando…</span>
            <LoaderCircle className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
