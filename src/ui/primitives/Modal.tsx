import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './IconButton'
import { trapTabFocus } from './focusTrap'

export interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Pie con botones. */
  footer?: ReactNode
  /** Si es false, no se puede cerrar con Escape ni clic fuera (p. ej. pedir nombre). */
  dismissible?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }

/**
 * Se monta en <body> con un portal: un ancestro con transform o backdrop-filter (asientos, header)
 * convertiría su `position: fixed` en relativo a ese ancestro.
 */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  size = 'md',
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  // En ref: los llamadores pasan `onClose` inline y no debe reejecutar los efectos en cada render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onCloseRef.current?.()
      else trapTabFocus(e, panelRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissible])

  // Enfoca el primer campo/botón al abrir y devuelve el foco a donde estaba al cerrar.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([data-modal-close])',
      )
      ;(el ?? panelRef.current)?.focus()
    }, 30)
    return () => {
      clearTimeout(t)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => dismissible && onClose?.()}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={cn(
              'relative w-full outline-none rounded-2xl border border-line bg-bg-elev p-6 shadow-panel',
              sizes[size],
              className,
            )}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            {(title || dismissible) && (
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  {title && (
                    <h2 id={titleId} className="text-lg font-extrabold tracking-tight">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p id={descriptionId} className="mt-1 text-sm text-ink-2">
                      {description}
                    </p>
                  )}
                </div>
                {dismissible && onClose && (
                  <IconButton data-modal-close label="Cerrar" icon={<X className="size-4" />} size="sm" onClick={onClose} />
                )}
              </div>
            )}
            <div>{children}</div>
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
