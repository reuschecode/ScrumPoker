import { useRef, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTable } from '@/store/hooks'
import { cn } from '@/lib/utils'
import { CardValue } from './PlayingCard'
import { INSTANT } from './motion'

const LIFT_TRANSITION = { type: 'spring', stiffness: 400, damping: 28 } as const

export function VotingDeck() {
  const { state, deck, myVote, status, dispatch } = useTable()
  const reduce = useReducedMotion()
  const listRef = useRef<HTMLDivElement>(null)
  if (!state || !deck) return null

  const revealed = state.round.revealed
  const offline = status !== 'connected'
  const disabled = revealed || offline
  const heading = offline
    ? 'Sin conexión con la mesa'
    : revealed
      ? 'Ronda revelada'
      : myVote
        ? `Tu voto: ${myVote}`
        : 'Elige tu carta'

  // Flechas, Inicio y Fin mueven el foco entre cartas.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0 || items.length === 0) return
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % items.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    items[next].focus()
  }

  return (
    <section aria-label="Tu mano de cartas" className="flex flex-col items-center gap-2">
      <p aria-live="polite" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
        {heading}
      </p>
      <div className="no-scrollbar w-full overflow-x-auto">
        <div
          ref={listRef}
          role="group"
          aria-label="Cartas para votar"
          onKeyDown={onKeyDown}
          className={cn('mx-auto flex w-max gap-2 px-4 pb-3 pt-4 transition-opacity duration-300', disabled && 'opacity-50')}
        >
          {deck.cards.map((card) => {
            const selected = myVote === card
            return (
              <motion.button
                key={card}
                type="button"
                aria-pressed={selected}
                aria-disabled={disabled}
                aria-label={`Votar ${card}`}
                className={cn(
                  'relative flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border-2 bg-card-face text-card-ink shadow-card',
                  'transition-[border-color,box-shadow] duration-200',
                  selected ? 'border-accent shadow-glow' : 'border-transparent',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                )}
                animate={{ y: selected ? -12 : 0 }}
                whileHover={disabled || reduce ? undefined : { y: selected ? -12 : -6 }}
                whileTap={disabled || reduce ? undefined : { scale: 0.96 }}
                transition={reduce ? INSTANT : LIFT_TRANSITION}
                onClick={() => {
                  if (disabled) return
                  dispatch(selected ? { type: 'CLEAR_VOTE' } : { type: 'VOTE', value: card })
                }}
              >
                <CardValue value={card} size="md" />
              </motion.button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
