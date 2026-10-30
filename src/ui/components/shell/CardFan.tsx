import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

const CARDS = ['3', '5', '8', '13'] as const

export interface CardFanProps {
  className?: string
}

/** Detalle decorativo del hero: cartas en abanico que entran con spring y flotan suavemente. */
export function CardFan({ className }: CardFanProps) {
  const reduce = useReducedMotion() ?? false
  const mid = (CARDS.length - 1) / 2

  return (
    <div className={cn('relative mx-auto h-56 w-72 sm:h-64 sm:w-80', className)} aria-hidden>
      {CARDS.map((value, i) => {
        const offset = i - mid
        const rotate = offset * 12
        const x = offset * 30
        const y = Math.abs(offset) * 10
        return (
          <motion.div
            key={value}
            className="absolute inset-0 m-auto h-44 w-[7.5rem] sm:h-52 sm:w-36"
            style={{ transformOrigin: '50% 140%', zIndex: i }}
            initial={reduce ? false : { opacity: 0, rotate: 0, x: 0, y: 48 }}
            animate={{ opacity: 1, rotate, x, y }}
            transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.15 + i * 0.07 }}
          >
            <motion.div
              className={cn(
                'flex h-full w-full flex-col justify-between rounded-lg bg-card-face p-3 text-card-ink shadow-card',
                'ring-1 ring-black/10 bg-[linear-gradient(160deg,#ffffff_0%,#eef0f8_100%)]',
              )}
              animate={reduce ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 4 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
            >
              <span className="text-xs font-extrabold leading-none">{value}</span>
              <span className="text-gradient self-center text-4xl font-extrabold leading-none sm:text-5xl">{value}</span>
              <span className="self-end rotate-180 text-xs font-extrabold leading-none">{value}</span>
            </motion.div>
          </motion.div>
        )
      })}
    </div>
  )
}
