import { memo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import { SPECIAL_CARDS } from '@/domain/types'
import { cn } from '@/lib/utils'
import { INSTANT, SPRING_FLIP, SPRING_POP, tr } from './motion'

export type PlayingCardState = 'empty' | 'hidden' | 'revealed' | 'mine'
export type CardSize = 'sm' | 'md'

/** 'sm' ≈ 44×62 px (asientos); 'md' ≈ 56×80 px (mano de cartas). */
export const CARD_SIZE: Record<CardSize, string> = {
  sm: 'h-[62px] w-11',
  md: 'h-20 w-14',
}

export function isSpecialValue(value: string): boolean {
  return (SPECIAL_CARDS as readonly string[]).includes(value)
}

interface CardValueProps {
  value: string
  size: CardSize
}

/** Valor como en un naipe: grande al centro y pequeño en esquinas opuestas. Las especiales, solo al centro. */
export function CardValue({ value, size }: CardValueProps) {
  const special = isSpecialValue(value)
  const long = value.length >= 3
  const center = special
    ? size === 'md'
      ? 'text-2xl'
      : 'text-xl'
    : long
      ? size === 'md'
        ? 'text-base'
        : 'text-xs'
      : size === 'md'
        ? 'text-xl'
        : 'text-lg'
  const corner = size === 'md' ? 'text-[10px]' : 'text-[8px]'
  return (
    <>
      {!special && (
        <>
          <span aria-hidden className={cn('absolute left-1 top-1 font-bold leading-none', corner)}>
            {value}
          </span>
          <span aria-hidden className={cn('absolute bottom-1 right-1 rotate-180 font-bold leading-none', corner)}>
            {value}
          </span>
        </>
      )}
      <span className={cn('font-extrabold leading-none tracking-tight', center)}>{value}</span>
    </>
  )
}

export interface PlayingCardProps {
  state: PlayingCardState
  /** Valor visible cuando la carta está boca arriba ('revealed' | 'mine'). */
  value?: string | null
  /** Retardo del volteo en segundos (escalonado por asiento al revelar). */
  delay?: number
  size?: CardSize
  className?: string
}

const CARD_SHADOW = 'shadow-[0_6px_16px_-6px_rgba(0,0,0,0.6)]'

/**
 * Naipe con volteo 3D. El contenedor da perspectiva; el interior gira en Y y cada cara oculta
 * su reverso. 'hidden' muestra el dorso (180°), 'revealed'/'mine' la cara (0°): al revelar,
 * la rotación anima de 180 → 0 con el retardo indicado.
 */
export const PlayingCard = memo(function PlayingCard({
  state,
  value,
  delay = 0,
  size = 'sm',
  className,
}: PlayingCardProps) {
  const reduce = useReducedMotion()
  const faceUp = state === 'revealed' || state === 'mine'
  const shown = faceUp && value ? value : ''
  const label = state === 'empty' ? 'Sin voto' : state === 'hidden' ? 'Voto oculto' : `Voto: ${shown || '—'}`

  return (
    <div role="img" aria-label={label} className={cn('perspective relative shrink-0', CARD_SIZE[size], className)}>
      <AnimatePresence initial={false}>
        {state === 'empty' ? (
          <motion.div
            key="empty"
            aria-hidden
            className="absolute inset-0 rounded-md border-2 border-dashed border-white/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tr(reduce, { duration: 0.2 })}
          />
        ) : (
          <motion.div
            key="card"
            aria-hidden
            className="preserve-3d absolute inset-0"
            initial={{ opacity: 0, scale: 0.8, rotateY: faceUp ? 0 : 180 }}
            animate={{ opacity: 1, scale: 1, rotateY: faceUp ? 0 : 180 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={reduce ? INSTANT : { ...SPRING_POP, rotateY: { ...SPRING_FLIP, delay } }}
          >
            {/* Cara */}
            <div
              className={cn(
                'backface-hidden absolute inset-0 flex items-center justify-center rounded-md bg-card-face text-card-ink',
                CARD_SHADOW,
                state === 'mine' && 'ring-2 ring-accent',
              )}
            >
              <CardValue value={shown} size={size} />
            </div>
            {/* Dorso */}
            <div
              className={cn(
                'backface-hidden absolute inset-0 rounded-md border border-white/25 bg-linear-to-br from-card-back to-card-back-2 [transform:rotateY(180deg)]',
                CARD_SHADOW,
              )}
            >
              <div className="absolute inset-[3px] rounded-[4px] border border-white/15 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.07)_0_3px,transparent_3px_7px)]" />
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-mint text-[#062a21] shadow">
                <Check className="size-3" strokeWidth={3} />
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
