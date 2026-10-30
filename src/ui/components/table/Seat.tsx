import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Crown, ShieldCheck, WifiOff } from 'lucide-react'
import { REACTION_TTL_MS, type Participant } from '@/domain/types'
import type { TableView } from '@/store/types'
import { cn } from '@/lib/utils'
import { Avatar, Badge } from '@/ui/primitives'
import { ParticipantMenu, type MenuAlign } from './ParticipantMenu'
import { PlayingCard, type PlayingCardState } from './PlayingCard'
import { SEAT_SIZE, type SeatPosition } from './seatLayout'
import { useNow } from './useNow'
import { INSTANT, SPRING_POP, SPRING_SOFT, tr } from './motion'

export interface SeatProps {
  participant: Participant
  isMe: boolean
  isHostP: boolean
  isAdminP: boolean
  /** Voto proyectado (HIDDEN_VOTE si es ajeno sin revelar) o undefined si no votó. */
  vote: string | undefined
  revealed: boolean
  /** Soy admin y este asiento no es el mío ni el del anfitrión. */
  canManage: boolean
  /** Retardo del volteo al revelar (s). */
  revealDelay: number
  /** Centro del asiento en % del contenedor (escritorio). Sin posición, el asiento va en flujo. */
  position?: SeatPosition
  dispatch: TableView['dispatch']
}

interface ReactionSeen {
  at: number
  /** Momento local en que vimos esta reacción. */
  seen: number
}

export const Seat = memo(function Seat({
  participant,
  isMe,
  isHostP,
  isAdminP,
  vote,
  revealed,
  canManage,
  revealDelay,
  position,
  dispatch,
}: SeatProps) {
  const reduce = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    if (!canManage) setMenuOpen(false)
  }, [canManage])

  const hasVote = vote !== undefined
  const cardState: PlayingCardState = !hasVote ? 'empty' : revealed ? 'revealed' : isMe ? 'mine' : 'hidden'
  const cardValue = cardState === 'revealed' || cardState === 'mine' ? vote : undefined

  // Pulso cuando aparece un voto nuevo (sin voto → con voto).
  const prevHasVote = useRef(hasVote)
  const [pulse, setPulse] = useState(0)
  useEffect(() => {
    if (hasVote && !prevHasVote.current) setPulse(Date.now())
    prevHasVote.current = hasVote
  }, [hasVote])

  // La reacción se cronometra desde que la vimos: robusto ante relojes desfasados host/cliente.
  // Una reacción presente al montar ya es vieja: se da por vencida, sin comparar con el reloj local.
  const reaction = participant.reaction
  const [seen, setSeen] = useState<ReactionSeen | null>(() =>
    reaction ? { at: reaction.at, seen: -Infinity } : null,
  )
  if (reaction && seen?.at !== reaction.at) setSeen({ at: reaction.at, seen: Date.now() })
  const now = useNow(500, seen ? seen.seen + REACTION_TTL_MS : null)
  const reactionVisible = !!reaction && !!seen && seen.at === reaction.at && now - seen.seen < REACTION_TTL_MS

  const style = position
    ? {
        left: `calc(${position.x}% - ${SEAT_SIZE.w / 2}px)`,
        top: `calc(${position.y}% - ${SEAT_SIZE.h / 2}px)`,
      }
    : undefined
  const menuAlign: MenuAlign = !position ? 'center' : position.x < 35 ? 'start' : position.x > 65 ? 'end' : 'center'
  const ariaLabel = [
    participant.name,
    isMe && 'tú',
    isHostP ? 'anfitrión' : isAdminP ? 'admin' : null,
    !participant.connected && 'desconectado',
    hasVote ? 'votó' : 'sin voto',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <motion.div
      layout="position"
      role="listitem"
      aria-label={ariaLabel}
      style={style}
      className={cn('group pointer-events-auto', position ? 'absolute' : 'relative', menuOpen && 'z-20')}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={tr(reduce, SPRING_SOFT)}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-1.5 transition-opacity duration-300',
          !participant.connected && 'opacity-50',
        )}
        style={{ width: SEAT_SIZE.w, height: position ? SEAT_SIZE.h : undefined }}
      >
        <PlayingCard state={cardState} value={cardValue} delay={revealDelay} size="sm" />

        <div className="relative flex">
          {pulse > 0 && (
            <motion.span
              key={pulse}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-accent"
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.8 }}
              transition={reduce ? INSTANT : { duration: 0.8, ease: 'easeOut' }}
              onAnimationComplete={() => setPulse(0)}
            />
          )}
          <Avatar id={participant.id} name={participant.name} size="lg" dimmed={!participant.connected} />
          <AnimatePresence>
            {reactionVisible && reaction && (
              <motion.span
                key={reaction.at}
                role="img"
                aria-label={`Reacción: ${reaction.emoji}`}
                className="pointer-events-none absolute -right-5 -top-4 select-none text-2xl drop-shadow-md"
                initial={{ scale: 0, y: 0, opacity: 0 }}
                animate={{ scale: 1, y: -8, opacity: 1 }}
                exit={{ scale: 0.5, y: -16, opacity: 0 }}
                transition={tr(reduce, SPRING_POP)}
              >
                {reaction.emoji}
              </motion.span>
            )}
          </AnimatePresence>
          {canManage && (
            <ParticipantMenu
              participant={participant}
              isAdminP={isAdminP}
              align={menuAlign}
              dispatch={dispatch}
              onOpenChange={setMenuOpen}
            />
          )}
        </div>

        <div className="flex max-w-28 items-center gap-1">
          <span className="truncate text-xs font-semibold text-ink" title={participant.name}>
            {participant.name}
          </span>
          {isHostP && (
            <span role="img" aria-label="Anfitrión" title="Anfitrión" className="shrink-0 text-warn">
              <Crown className="size-3.5" strokeWidth={1.75} />
            </span>
          )}
          {isAdminP && !isHostP && (
            <span role="img" aria-label="Admin" title="Admin" className="shrink-0 text-accent">
              <ShieldCheck className="size-3.5" strokeWidth={1.75} />
            </span>
          )}
        </div>

        {(isMe || !participant.connected) && (
          <div className="flex items-center gap-1">
            {isMe && (
              <Badge tone="accent" className="px-1.5 py-0 text-[10px]">
                Tú
              </Badge>
            )}
            {!participant.connected && (
              <Badge tone="neutral" icon={<WifiOff strokeWidth={1.75} />} className="px-1.5 py-0 text-[10px]">
                desconectado
              </Badge>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
})
