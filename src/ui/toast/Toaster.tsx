import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/ui/primitives'
import { MOBILE_QUERY, useMediaQuery } from '@/ui/components/shell/useMediaQuery'
import { useToastStore, type Toast, type ToastTone } from './toastStore'

const toneStyles: Record<ToastTone, { border: string; bar: string }> = {
  neutral: { border: 'border-line-strong', bar: 'bg-ink-3' },
  accent: { border: 'border-accent/40', bar: 'bg-accent' },
  mint: { border: 'border-mint/40', bar: 'bg-mint' },
  warn: { border: 'border-warn/40', bar: 'bg-warn' },
  danger: { border: 'border-danger/40', bar: 'bg-danger' },
}

/** Lista de toasts: abajo-derecha en escritorio, arriba-centro en móvil. Montar una sola vez (App). */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  const isMobile = useMediaQuery(MOBILE_QUERY)

  return (
    <div
      aria-live="polite"
      aria-label="Notificaciones"
      className={cn(
        'pointer-events-none fixed z-[60] flex gap-2 px-4',
        'inset-x-0 top-[max(1rem,env(safe-area-inset-top))] flex-col-reverse items-center',
        'sm:inset-x-auto sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-4 sm:top-auto sm:flex-col sm:items-end sm:px-0',
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} isMobile={isMobile} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  isMobile: boolean
  onDismiss: (id: string) => void
}

function ToastItem({ toast, isMobile, onDismiss }: ToastItemProps) {
  const reduce = useReducedMotion() ?? false
  const bar = useAnimationControls()
  const tone = toneStyles[toast.tone]

  // Temporizador con pausa: al pasar el ratón (o enfocar) se congela el tiempo restante.
  const remaining = useRef(toast.durationMs)
  const startedAt = useRef(0)
  const timer = useRef<number | null>(null)
  // Hover y foco pausan por separado: solo se reanuda cuando no queda ninguno de los dos.
  const hovered = useRef(false)
  const focused = useRef(false)
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  const resume = useCallback(() => {
    if (toast.durationMs <= 0 || timer.current !== null) return
    startedAt.current = Date.now()
    timer.current = window.setTimeout(() => {
      timer.current = null
      dismissRef.current(toast.id)
    }, remaining.current)
    void bar.start({ scaleX: 0, transition: { duration: remaining.current / 1000, ease: 'linear' } })
  }, [bar, toast.durationMs, toast.id])

  const pause = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
    bar.stop()
  }, [bar])

  useEffect(() => {
    resume()
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [resume])

  const enter = reduce ? { opacity: 0 } : isMobile ? { opacity: 0, y: -16, scale: 0.98 } : { opacity: 0, x: 28, scale: 0.98 }

  return (
    <motion.div
      layout={!reduce}
      role="status"
      className={cn(
        'pointer-events-auto relative flex w-[min(92vw,22rem)] items-start gap-3 overflow-hidden rounded-lg border',
        'bg-bg-elev/95 py-3 pl-4 pr-2 shadow-panel backdrop-blur',
        tone.border,
      )}
      initial={enter}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onMouseEnter={() => {
        hovered.current = true
        pause()
      }}
      onMouseLeave={() => {
        hovered.current = false
        if (!focused.current) resume()
      }}
      onFocus={() => {
        focused.current = true
        pause()
      }}
      onBlur={() => {
        focused.current = false
        if (!hovered.current) resume()
      }}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} aria-hidden />
      {toast.emoji && (
        <span className="text-lg leading-6" aria-hidden>
          {toast.emoji}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs leading-snug text-ink-2">{toast.description}</p>}
      </div>
      <IconButton
        size="sm"
        label="Cerrar aviso"
        icon={<X className="size-4" strokeWidth={1.75} />}
        onClick={() => onDismiss(toast.id)}
        className="-my-1 -mr-1"
      />
      {toast.durationMs > 0 && (
        <motion.span
          className={cn('absolute bottom-0 left-0 h-0.5 w-full origin-left opacity-60', tone.bar)}
          initial={{ scaleX: 1 }}
          animate={bar}
          aria-hidden
        />
      )}
    </motion.div>
  )
}
