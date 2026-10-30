import { useId, useRef, type KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { Deck, DeckId } from '@/domain/types'
import { DECK_LIST } from '@/domain/deck'
import { cn } from '@/lib/utils'

export interface DeckPickerProps {
  value: DeckId
  onChange: (id: DeckId) => void
  decks?: readonly Deck[]
  label?: string
}

/** Selector de mazo (radiogroup): muestra el nombre y las cartas de cada mazo; flechas para moverse. */
export function DeckPicker({ value, onChange, decks = DECK_LIST, label = 'Mazo' }: DeckPickerProps) {
  const reduce = useReducedMotion() ?? false
  const labelId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const move = (from: number, delta: number) => {
    const n = decks.length
    if (n === 0) return
    const next = (from + delta + n) % n
    onChange(decks[next].id)
    refs.current[next]?.focus()
  }

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(i, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(i, -1)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="text-xs font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
        {decks.map((d, i) => {
          const selected = d.id === value
          return (
            <button
              key={d.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(d.id)}
              onKeyDown={onKeyDown(i)}
              className={cn(
                'flex flex-col gap-2 rounded-lg border p-3 text-left',
                'transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-smooth)]',
                selected
                  ? 'border-accent bg-accent-soft/40 shadow-glow'
                  : 'border-line-strong bg-surface hover:border-accent/50 hover:bg-surface-2',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{d.label}</span>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                    selected ? 'border-accent bg-accent text-bg' : 'border-line-strong',
                  )}
                  aria-hidden
                >
                  {selected && (
                    <motion.span
                      className="flex"
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                    >
                      <Check className="size-3" strokeWidth={2.5} />
                    </motion.span>
                  )}
                </span>
              </span>
              <span className="line-clamp-2 text-xs text-ink-3">{d.description}</span>
              <span className="flex flex-wrap gap-1" aria-label={`Cartas: ${d.cards.join(', ')}`}>
                {d.cards.map((c) => (
                  <span
                    key={c}
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-mono text-[10px] font-semibold',
                      'transition-colors duration-200',
                      selected ? 'border-accent/30 bg-accent-soft text-accent' : 'border-line bg-white/6 text-ink-2',
                    )}
                  >
                    {c}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
