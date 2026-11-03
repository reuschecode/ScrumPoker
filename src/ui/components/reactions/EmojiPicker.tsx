import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { firstEmoji } from '@/domain/emoji'
import { cn } from '@/lib/utils'

const CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Caras',
    emojis: ['😀', '😁', '😅', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥳', '😎', '🤓', '🧐', '🤨', '😐', '🙄', '😬', '😴', '🥱', '🤯', '😱', '😭', '😤', '😡', '🤬', '🥶', '🥵', '🤢', '🤡', '💀', '👻', '🤖', '👽', '🙈', '🙉', '🙊'],
  },
  {
    label: 'Gestos',
    emojis: ['👋', '🙌', '🙏', '🤝', '💪', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👈', '👉', '👆', '👇', '☝️', '✋', '🫡', '🤷', '🤦', '🙋', '🫶', '👀', '🧠'],
  },
  {
    label: 'Corazones',
    emojis: ['🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '💥', '✨', '⭐', '🌟', '💫'],
  },
  {
    label: 'Trabajo',
    emojis: ['🚀', '🎯', '🏆', '🥇', '📈', '📉', '💡', '🐛', '🔧', '🛠️', '⚙️', '🧪', '📌', '📎', '📝', '✅', '❌', '⚠️', '⏰', '⏳', '🚧', '🔒', '💻', '🧩'],
  },
  {
    label: 'Comida',
    emojis: ['🍕', '🍔', '🌮', '🍣', '🍩', '🍪', '🍫', '🍿', '🥐', '🍎', '🍺', '🍷', '🧉', '🥤', '🧃', '🍵'],
  },
  {
    label: 'Animales y más',
    emojis: ['🦄', '🐢', '🐌', '🦥', '🐶', '🐱', '🦊', '🐼', '🐸', '🦉', '🐙', '🦖', '🌈', '☀️', '🌧️', '⚡', '❄️', '🌵', '🍀', '🎲', '🎮', '🎸', '🎈', '🎁'],
  },
]

export interface EmojiPickerProps {
  onPick: (emoji: string) => void
  onClose: () => void
}

/**
 * Selector compacto: emojis por categorías y un campo para escribir o pegar cualquier otro
 * (incluido el selector de emojis del sistema operativo).
 */
export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const typed = firstEmoji(text)

  useEffect(() => {
    inputRef.current?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Tras el clic que lo abrió, para que ese mismo clic no lo cierre.
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onPointer), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (typed) onPick(typed)
  }

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-label="Elegir emoji"
      className="glass absolute bottom-full right-0 z-30 mb-2 flex w-[min(20rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl shadow-panel"
      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <form onSubmit={submit} className="flex items-center gap-2 border-b border-line p-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe o pega cualquier emoji"
          aria-label="Escribe o pega cualquier emoji"
          className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2.5 text-sm outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <button
          type="submit"
          disabled={!typed}
          aria-label={typed ? `Reaccionar con ${typed}` : 'Escribe un emoji'}
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-xl transition-colors',
            typed ? 'bg-accent-soft hover:bg-accent/25' : 'cursor-not-allowed opacity-40',
          )}
        >
          {typed ?? '＋'}
        </button>
      </form>
      <div className="max-h-64 overflow-y-auto p-2">
        {CATEGORIES.map((cat) => (
          <section key={cat.label} aria-label={cat.label} className="mb-2 last:mb-0">
            <h3 className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink-3">{cat.label}</h3>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onPick(emoji)}
                  aria-label={`Reaccionar con ${emoji}`}
                  className="inline-flex aspect-square items-center justify-center rounded-md text-xl transition-[background-color,transform] duration-150 hover:scale-110 hover:bg-white/8"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </motion.div>
  )
}
