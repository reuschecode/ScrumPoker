import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { History, MessageSquare, X } from 'lucide-react'
import { ChatPanel } from '@/ui/components/chat'
import { HistoryPanel } from '@/ui/components/history'
import { cn } from '@/lib/utils'
import { IconButton } from '@/ui/primitives'
import { trapTabFocus } from '@/ui/primitives/focusTrap'

export type SideTab = 'chat' | 'history'

export interface SidePanelProps {
  /** Solo aplica en < 1024px (drawer). En escritorio el panel siempre está visible. */
  open: boolean
  tab: SideTab
  unread: number
  isDesktop: boolean
  onTabChange: (tab: SideTab) => void
  onClose: () => void
}

const TABS: Array<{ id: SideTab; label: string; icon: ReactNode }> = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden /> },
  { id: 'history', label: 'Historial', icon: <History className="size-4" strokeWidth={1.75} aria-hidden /> },
]

/**
 * Panel lateral con pestañas Chat / Historial. En escritorio es una columna fija de 360px; en móvil,
 * un drawer que entra desde la derecha. El mismo <aside> sirve para ambos modos para que el chat
 * (borrador, scroll) no se pierda al abrir/cerrar ni al cambiar de tamaño.
 */
export function SidePanel({ open, tab, unread, isDesktop, onTabChange, onClose }: SidePanelProps) {
  const reduce = useReducedMotion() ?? false
  const baseId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const visible = isDesktop || open

  useEffect(() => {
    if (isDesktop || !open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else trapTabFocus(e, asideRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [isDesktop, open, onClose])

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length]
    onTabChange(next.id)
    document.getElementById(`${baseId}-${next.id}-tab`)?.focus()
  }

  const panelId = (id: SideTab) => `${baseId}-${id}-panel`
  const tabId = (id: SideTab) => `${baseId}-${id}-tab`

  return (
    <>
      <AnimatePresence>
        {!isDesktop && open && (
          <motion.div
            key="side-overlay"
            className="fixed inset-0 z-30 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <motion.aside
        ref={asideRef}
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={isDesktop ? undefined : true}
        aria-label="Chat e historial"
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        className={cn(
          'flex flex-col',
          isDesktop
            ? 'relative w-[360px] shrink-0 border-l border-line bg-bg-elev/60'
            : 'glass fixed inset-y-0 right-0 z-40 w-[min(360px,88vw)] shadow-panel',
        )}
        initial={false}
        animate={{ x: visible ? 0 : '100%' }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-2">
          <div role="tablist" aria-label="Paneles de la mesa" className="flex flex-1 gap-1">
            {TABS.map((t) => {
              const selected = tab === t.id
              const showBadge = t.id === 'chat' && unread > 0
              return (
                <button
                  key={t.id}
                  id={tabId(t.id)}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId(t.id)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onTabChange(t.id)}
                  onKeyDown={onTabKeyDown}
                  className={cn(
                    'relative flex h-9 flex-1 items-center justify-center rounded-md text-sm font-semibold transition-colors',
                    selected ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId={`${baseId}-tab-bg`}
                      className="absolute inset-0 rounded-md bg-white/6"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 32 }}
                      aria-hidden
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    {t.icon}
                    {t.label}
                    {showBadge && (
                      <span
                        className="tabular inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-bg"
                        aria-label={`${unread} mensajes sin leer`}
                      >
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          {!isDesktop && (
            <IconButton
              ref={closeRef}
              size="sm"
              label="Cerrar panel"
              icon={<X className="size-4" strokeWidth={1.75} />}
              onClick={onClose}
            />
          )}
        </div>

        <div
          id={panelId('chat')}
          role="tabpanel"
          aria-labelledby={tabId('chat')}
          hidden={tab !== 'chat'}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ChatPanel active={visible && tab === 'chat'} />
        </div>
        <div
          id={panelId('history')}
          role="tabpanel"
          aria-labelledby={tabId('history')}
          hidden={tab !== 'history'}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          <HistoryPanel />
        </div>
      </motion.aside>
    </>
  )
}
