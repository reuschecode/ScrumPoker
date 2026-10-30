import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil } from 'lucide-react'
import { LIMITS } from '@/domain/types'
import { useTable } from '@/store/hooks'
import { cn } from '@/lib/utils'
import { Badge } from '@/ui/primitives'

export function StoryBar() {
  const { state, status, isAdmin, dispatch } = useTable()
  const story = state?.round.story ?? ''
  const number = state?.round.number ?? 1
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(story)
  const focusedRef = useRef(false)
  const dirtyRef = useRef(false)

  // Si otro admin cambia la historia y yo no estoy escribiendo, me sincronizo.
  useEffect(() => {
    if (!focusedRef.current || !dirtyRef.current) {
      setDraft(story)
      dirtyRef.current = false
    }
  }, [story])

  // El borrador es de una ronda: al pasar a otra se descarta, aunque el campo tenga el foco.
  // Se observa el número y no el id: RESET_ROUND cambia el id pero sigue con la misma historia.
  useEffect(() => {
    dirtyRef.current = false
    setDraft(story)
  }, [number])

  // Lo que se confirmó sin conexión se reenvía al reconectar (si otro admin cambió la historia
  // entretanto, el efecto de sincronización ya lo descartó).
  useEffect(() => {
    if (status !== 'connected' || !dirtyRef.current || focusedRef.current) return
    dirtyRef.current = false
    const next = draft.trim()
    if (isAdmin && next !== story) dispatch({ type: 'SET_STORY', story: next })
    else setDraft(story)
  }, [status])

  if (!state) return null

  const commit = () => {
    if (!dirtyRef.current) return
    const next = draft.trim()
    setDraft(next)
    // Sin conexión el comando se pierde: sigue pendiente para reenviarlo al reconectar.
    dirtyRef.current = next !== story && status !== 'connected'
    if (next !== story) dispatch({ type: 'SET_STORY', story: next })
  }
  const restore = () => {
    dirtyRef.current = false
    setDraft(story)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      inputRef.current?.blur() // el blur confirma
    } else if (e.key === 'Escape') {
      e.preventDefault()
      restore()
      inputRef.current?.blur()
    }
  }
  const nearLimit = draft.length >= LIMITS.MAX_STORY - 20

  return (
    <div className="flex items-center gap-3">
      <Badge tone="accent" className="shrink-0">
        Ronda {number}
      </Badge>
      {isAdmin ? (
        <div className="group relative flex min-w-0 flex-1 items-center">
          <label htmlFor={inputId} className="sr-only">
            Historia de usuario de esta ronda
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={draft}
            maxLength={LIMITS.MAX_STORY}
            placeholder="¿Qué historia estamos puntuando?"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setDraft(e.target.value)
              dirtyRef.current = true
            }}
            onFocus={() => {
              focusedRef.current = true
            }}
            onBlur={() => {
              focusedRef.current = false
              commit()
            }}
            onKeyDown={onKeyDown}
            className={cn(
              'w-full min-w-0 rounded-md border border-transparent bg-transparent py-1 pl-2 text-lg font-bold text-ink outline-none',
              'transition-[border-color,background-color] duration-200 placeholder:font-semibold placeholder:text-ink-3',
              'hover:border-line-strong focus:border-accent focus:bg-surface/60',
              nearLimit ? 'pr-20' : 'pr-9',
            )}
          />
          <span className="pointer-events-none absolute right-2 flex items-center gap-1.5 text-ink-3">
            {nearLimit && (
              <span className="tabular text-[10px]">
                {draft.length}/{LIMITS.MAX_STORY}
              </span>
            )}
            <Pencil
              className="size-4 opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-0"
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
        </div>
      ) : (
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-ink" title={story || undefined}>
          {story || <span className="font-medium text-ink-3">Sin historia todavía</span>}
        </h2>
      )}
    </div>
  )
}
