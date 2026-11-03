import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SmilePlus } from 'lucide-react'
import { REACTION_EMOJIS } from '@/domain/types'
import { useTable } from '@/store/hooks'
import { cn } from '@/lib/utils'
import { useCustomReactions } from './customReactions'
import { EmojiPicker } from './EmojiPicker'

/** Tiempo mínimo entre dos reacciones con el mismo emoji (evita spam accidental). */
const COOLDOWN_MS = 600

export function ReactionBar() {
  const { status, dispatch } = useTable()
  const reduceMotion = !!useReducedMotion()
  const enabled = status === 'connected'

  const react = useCallback((emoji: string) => dispatch({ type: 'REACT', emoji }), [dispatch])
  const customs = useCustomReactions((s) => s.emojis)
  const remember = useCustomReactions((s) => s.remember)
  const [pickerOpen, setPickerOpen] = useState(false)
  const closePicker = useCallback(() => setPickerOpen(false), [])
  const pick = useCallback(
    (emoji: string) => {
      react(emoji)
      remember(emoji)
      setPickerOpen(false)
    },
    [react, remember],
  )

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
      <AnimatePresence initial={false}>
        {customs.map((emoji) => (
          <motion.span
            key={emoji}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
          >
            <ReactionButton emoji={emoji} disabled={!enabled} onReact={react} reduceMotion={reduceMotion} />
          </motion.span>
        ))}
      </AnimatePresence>
      <span className="relative">
        <button
          type="button"
          title="Otro emoji"
          aria-label="Reaccionar con otro emoji"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          disabled={!enabled}
          onClick={() => setPickerOpen((o) => !o)}
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-2',
            'transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed',
            pickerOpen && 'border-accent text-accent',
          )}
        >
          <SmilePlus className="size-5" strokeWidth={1.75} aria-hidden />
        </button>
        <AnimatePresence>{pickerOpen && enabled && <EmojiPicker onPick={pick} onClose={closePicker} />}</AnimatePresence>
      </span>
    </div>
  )
}

interface ReactionButtonProps {
  emoji: string
  disabled: boolean
  reduceMotion: boolean
  onReact: (emoji: string) => void
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
