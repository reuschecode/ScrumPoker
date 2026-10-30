import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Ellipsis, ShieldCheck, ShieldMinus, UserX } from 'lucide-react'
import type { Participant } from '@/domain/types'
import type { TableView } from '@/store/types'
import { cn } from '@/lib/utils'
import { playSound } from '@/sound'
import { ConfirmDialog } from './ConfirmDialog'
import { SPRING_POP, tr } from './motion'

export type MenuAlign = 'start' | 'center' | 'end'

export interface ParticipantMenuProps {
  participant: Participant
  /** El participante ya es admin. (El anfitrión no tiene menú: no se le puede degradar ni expulsar.) */
  isAdminP: boolean
  /** Lado hacia el que se abre el popover, según dónde esté el asiento. */
  align?: MenuAlign
  dispatch: TableView['dispatch']
  /** Avisa al asiento para que suba su z-index mientras el menú está abierto. */
  onOpenChange?: (open: boolean) => void
}

const ALIGN: Record<MenuAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
}

export function ParticipantMenu({ participant, isAdminP, align = 'center', dispatch, onOpenChange }: ParticipantMenuProps) {
  const reduce = useReducedMotion()
  const menuId = useId()
  const [open, setOpenState] = useState(false)
  const [confirmKick, setConfirmKick] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  // Abierto: foco al primer ítem; Escape o clic fuera cierran.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, setOpen])

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    e.preventDefault()
    items[next].focus()
  }

  const toggleAdmin = () => {
    dispatch(
      isAdminP ? { type: 'REVOKE_ADMIN', userId: participant.id } : { type: 'GRANT_ADMIN', userId: participant.id },
    )
    setOpen(false)
    buttonRef.current?.focus()
  }
  const askKick = () => {
    setOpen(false)
    buttonRef.current?.focus() // el ítem desaparece: el modal debe devolver el foco al botón
    setConfirmKick(true)
  }
  const kick = () => {
    setConfirmKick(false)
    dispatch({ type: 'KICK', userId: participant.id })
  }

  return (
    <div ref={rootRef} className="absolute -bottom-1 -right-1">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Opciones de ${participant.name}`}
        title="Opciones"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (!open) playSound('click')
          setOpen(!open)
        }}
        className={cn(
          'flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-ink-2 shadow',
          'transition-[opacity,color,background-color] duration-200 hover:bg-surface-3 hover:text-ink',
          'focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:size-7 pointer-coarse:opacity-100',
          open ? 'opacity-100' : 'opacity-0',
        )}
      >
        <Ellipsis className="size-3.5" strokeWidth={2} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            role="menu"
            aria-label={`Opciones de ${participant.name}`}
            onKeyDown={onMenuKeyDown}
            className={cn('glass absolute top-full z-30 mt-1.5 w-44 rounded-lg p-1 shadow-panel', ALIGN[align])}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={tr(reduce, SPRING_POP)}
          >
            <MenuItem
              icon={isAdminP ? <ShieldMinus strokeWidth={1.75} /> : <ShieldCheck strokeWidth={1.75} />}
              onClick={toggleAdmin}
            >
              {isAdminP ? 'Quitar admin' : 'Hacer admin'}
            </MenuItem>
            <MenuItem icon={<UserX strokeWidth={1.75} />} tone="danger" onClick={askKick}>
              Expulsar
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmKick}
        title={`¿Expulsar a ${participant.name}?`}
        description="No podrá volver a entrar a esta mesa."
        confirmLabel="Expulsar"
        tone="danger"
        onConfirm={kick}
        onCancel={() => setConfirmKick(false)}
      />
    </div>
  )
}

interface MenuItemProps {
  icon: ReactNode
  tone?: 'danger'
  onClick: () => void
  children: ReactNode
}

function MenuItem({ icon, tone, onClick, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors [&>svg]:size-4 [&>svg]:shrink-0',
        tone === 'danger' ? 'text-danger hover:bg-danger-soft' : 'text-ink-2 hover:bg-white/6 hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
