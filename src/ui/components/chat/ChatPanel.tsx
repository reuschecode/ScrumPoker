import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, MessagesSquare, Send } from 'lucide-react'
import { LIMITS, type ChatMessage, type UserId } from '@/domain/types'
import { useTable } from '@/store/hooks'
import { cn, formatTime } from '@/lib/utils'
import { Avatar, IconButton } from '@/ui/primitives'
import { useUnreadStore } from '@/ui/components/chat/unreadStore'

/** Mensajes seguidos del mismo autor dentro de esta ventana se muestran agrupados. */
const GROUP_WINDOW_MS = 2 * 60_000
/** Distancia al fondo (px) hasta la que seguimos considerando que el usuario "está abajo". */
const BOTTOM_THRESHOLD_PX = 80
/** El contador de caracteres aparece cuando quedan menos que esto. */
const COUNTER_THRESHOLD = 50

const EMPTY_CHAT: ChatMessage[] = []
const SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const

interface MessageGroup {
  /** id del primer mensaje: estable mientras el grupo exista. */
  key: string
  userId: UserId
  name: string
  at: number
  mine: boolean
  messages: ChatMessage[]
}

function groupMessages(chat: ChatMessage[], me: UserId): MessageGroup[] {
  const groups: MessageGroup[] = []
  for (const msg of chat) {
    const last = groups.length > 0 ? groups[groups.length - 1] : undefined
    const prev = last ? last.messages[last.messages.length - 1] : undefined
    if (last && prev && last.userId === msg.userId && last.name === msg.name && msg.at - prev.at <= GROUP_WINDOW_MS) {
      last.messages.push(msg)
    } else {
      groups.push({ key: msg.id, userId: msg.userId, name: msg.name, at: msg.at, mine: msg.userId === me, messages: [msg] })
    }
  }
  return groups
}

export interface ChatPanelProps {
  /** true cuando el panel está visible (pestaña o drawer abierto): marca los mensajes como leídos. */
  active: boolean
}

export function ChatPanel({ active }: ChatPanelProps) {
  const { state, code, me, status, dispatch } = useTable()
  const chat = state?.chat ?? EMPTY_CHAT
  const markRead = useUnreadStore((s) => s.markRead)
  const reduceMotion = !!useReducedMotion()
  const connected = status === 'connected'
  const textareaId = useId()

  const groups = useMemo(() => groupMessages(chat, me), [chat, me])

  // ----- no leídos: con el panel activo, todo lo que hay en pantalla cuenta como leído.
  useEffect(() => {
    if (active && code) markRead(code, chat.length > 0 ? chat[chat.length - 1].id : null)
  }, [active, code, chat, markRead])

  // ----- scroll
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const prevLastIdRef = useRef<string | null | undefined>(undefined)
  const [showJump, setShowJump] = useState(false)

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = listRef.current
      if (!el) return
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' })
    },
    [reduceMotion],
  )

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX
    atBottomRef.current = atBottom
    if (atBottom) setShowJump(false)
  }, [])

  const lastMessage = chat.length > 0 ? chat[chat.length - 1] : null
  const lastId = lastMessage?.id ?? null
  const lastIsMine = lastMessage?.userId === me

  useLayoutEffect(() => {
    const first = prevLastIdRef.current === undefined
    prevLastIdRef.current = lastId
    if (first) {
      scrollToBottom(false)
      return
    }
    if (!lastId) return
    // Un mensaje propio siempre baja la lista; uno ajeno solo si ya estábamos abajo.
    if (atBottomRef.current || lastIsMine) scrollToBottom(true)
    else setShowJump(true)
  }, [lastId, lastIsMine, scrollToBottom])

  // Oculto (display: none) el scroll no se aplica: al volver a activarse, re-anclamos al fondo.
  useLayoutEffect(() => {
    if (active && atBottomRef.current) scrollToBottom(false)
  }, [active, scrollToBottom])

  const jumpToNew = useCallback(() => {
    scrollToBottom(true)
    setShowJump(false)
  }, [scrollToBottom])

  // ----- redacción
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const remaining = LIMITS.MAX_CHAT_TEXT - text.length
  const canSend = connected && text.trim().length > 0

  // Autoexpande el textarea (1-4 líneas; el máximo lo fija max-h en CSS).
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
    if (atBottomRef.current) scrollToBottom(false)
  }, [text, scrollToBottom])

  const send = useCallback(() => {
    const value = text.trim()
    if (!value || !connected) return
    dispatch({ type: 'CHAT', text: value.slice(0, LIMITS.MAX_CHAT_TEXT) })
    setText('')
    textareaRef.current?.focus()
  }, [text, connected, dispatch])

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    send()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-label="Mensajes del chat"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        >
          {groups.length === 0 ? (
            <EmptyState />
          ) : (
            <ol className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {groups.map((group) => (
                  <MessageGroupItem key={group.key} group={group} reduceMotion={reduceMotion} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>

        <AnimatePresence>
          {showJump && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={reduceMotion ? { duration: 0 } : SPRING}
            >
              <button
                type="button"
                onClick={jumpToNew}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-bg shadow-card transition-colors hover:bg-accent-strong"
              >
                <ArrowDown className="size-3.5" strokeWidth={2} aria-hidden />
                Nuevos mensajes
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form onSubmit={onSubmit} className="border-t border-line p-3">
        <div
          className={cn(
            'flex items-end gap-2 rounded-lg border border-line-strong bg-surface py-1.5 pr-1.5 pl-3',
            'transition-[border-color,box-shadow] duration-200',
            'focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(124,140,255,0.18)]',
          )}
        >
          <label htmlFor={textareaId} className="sr-only">
            Mensaje
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={LIMITS.MAX_CHAT_TEXT}
            disabled={!connected}
            placeholder={connected ? 'Escribe un mensaje…' : 'Sin conexión'}
            enterKeyHint="send"
            aria-describedby={`${textareaId}-hint`}
            className="max-h-[5.5rem] min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-5 outline-none placeholder:text-ink-3 disabled:opacity-60"
          />
          <IconButton
            type="submit"
            label="Enviar"
            size="sm"
            variant="solid"
            disabled={!canSend}
            icon={<Send className="size-4" strokeWidth={1.75} aria-hidden />}
            // `!` porque el variant "solid" ya fija fondo/color y Tailwind ordena por nombre, no por uso.
            className={cn(canSend && 'border-transparent! bg-accent! text-bg! hover:bg-accent-strong!')}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-3">
          <span id={`${textareaId}-hint`}>Enter envía · Shift+Enter, nueva línea</span>
          {remaining < COUNTER_THRESHOLD && (
            <span className={cn('tabular', remaining <= 0 && 'text-danger')} aria-live="polite">
              {remaining}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-3">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2">
        <MessagesSquare className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm">Aún no hay mensajes. ¡Saluda al equipo!</p>
    </div>
  )
}

interface MessageGroupItemProps {
  group: MessageGroup
  reduceMotion: boolean
}

const MessageGroupItem = memo(
  function MessageGroupItem({ group, reduceMotion }: MessageGroupItemProps) {
    const { mine, name, at, userId, messages } = group
    return (
      <motion.li
        className={cn('flex gap-2', mine && 'flex-row-reverse')}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <Avatar id={userId} name={name} size="sm" className="mt-0.5" />
        <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-1', mine ? 'items-end' : 'items-start')}>
          <div className={cn('flex items-baseline gap-2 px-1 text-[11px]', mine && 'flex-row-reverse')}>
            <span className="max-w-40 truncate font-semibold text-ink-2">{name}</span>
            <time dateTime={new Date(at).toISOString()} className="tabular text-ink-3">
              {formatTime(at)}
            </time>
          </div>
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                title={formatTime(m.at)}
                className={cn(
                  'max-w-full rounded-2xl px-3 py-1.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-ink',
                  mine ? 'rounded-tr-md bg-accent-soft' : 'rounded-tl-md bg-surface-2',
                )}
              >
                {m.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.li>
    )
  },
  // Los mensajes son inmutables: mismo primer id + misma longitud ⇒ mismo contenido.
  (a, b) =>
    a.group.key === b.group.key &&
    a.group.name === b.group.name &&
    a.group.mine === b.group.mine &&
    a.group.messages.length === b.group.messages.length &&
    a.reduceMotion === b.reduceMotion,
)
