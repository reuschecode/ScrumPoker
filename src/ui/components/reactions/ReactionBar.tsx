import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { REACTION_EMOJIS, type ReactionEmoji } from '@/domain/types'
import { useTable } from '@/store/hooks'
import { cn } from '@/lib/utils'

/** Tiempo mínimo entre dos reacciones con el mismo emoji (evita spam accidental). */
const COOLDOWN_MS = 600

export function ReactionBar() {
  const { status, dispatch } = useTable()
  const reduceMotion = !!useReducedMotion()
  const enabled = status === 'connected'

  const react = useCallback((emoji: ReactionEmoji) => dispatch({ type: 'REACT', emoji }), [dispatch])

  return (
    <div
      role="group"
      aria-label="Reacciones"
      aria-disabled={!enabled || undefined}
      className={cn('flex flex-wrap items-center justify-center gap-1 transition-opacity', !enabled && 'opacity-50')}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <ReactionButton key={emoji} emoji={emoji} disabled={!enabled} onReact={react} reduceMotion={reduceMotion} />
      ))}
    </div>
  )
}

interface ReactionButtonProps {
  emoji: ReactionEmoji
  disabled: boolean
  reduceMotion: boolean
  onReact: (emoji: ReactionEmoji) => void
}

// Cada botón lleva su propio cooldown para que reaccionar no re-renderice toda la fila.
const ReactionButton = memo(function ReactionButton({ emoji, disabled, reduceMotion, onReact }: ReactionButtonProps) {
  const [cooling, setCooling] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const handleClick = () => {
    if (disabled || cooling) return
    onReact(emoji)
    setCooling(true)
    timer.current = window.setTimeout(() => {
      timer.current = null
      setCooling(false)
    }, COOLDOWN_MS)
  }

  const label = `Reaccionar con ${emoji}`
  return (
    <motion.button
      type="button"
      title={label}
      aria-label={label}
      aria-disabled={cooling || disabled || undefined}
      disabled={disabled}
      onClick={handleClick}
      whileHover={reduceMotion || disabled ? undefined : { scale: 1.15 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full text-xl leading-none select-none',
        'transition-[background-color,opacity] duration-200 hover:bg-white/5',
        'disabled:cursor-not-allowed',
        cooling && 'opacity-60',
      )}
    >
      <span aria-hidden>{emoji}</span>
    </motion.button>
  )
})
