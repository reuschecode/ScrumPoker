import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EditableTextProps {
  value: string
  onSave: (next: string) => void
  /** Si es false se muestra como texto plano. */
  editable?: boolean
  maxLength?: number
  /** Etiqueta accesible del botón y del campo, p. ej. "Editar nombre de la mesa". */
  label: string
  placeholder?: string
  /** Normaliza el borrador antes de guardar (por defecto colapsa espacios y recorta). */
  sanitize?: (raw: string) => string
  className?: string
  textClassName?: string
}

const defaultSanitize = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Texto editable en línea: clic (o el lápiz) abre un input; Enter/blur guarda, Escape cancela.
 * Solo llama a onSave si el valor cambió y no quedó vacío.
 */
export function EditableText({
  value,
  onSave,
  editable = false,
  maxLength,
  label,
  placeholder = '—',
  sanitize = defaultSanitize,
  className,
  textClassName,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  // Evita el doble guardado cuando Enter (o Escape) y el blur posterior llegan seguidos.
  const doneRef = useRef(false)
  // Valor al abrir: un borrador intacto no debe pisar un cambio remoto hecho durante la edición.
  const initialRef = useRef(value)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const refocusRef = useRef(false)

  useEffect(() => {
    if (editing || !refocusRef.current) return
    refocusRef.current = false
    buttonRef.current?.focus()
  }, [editing])

  const start = () => {
    doneRef.current = false
    initialRef.current = value
    setDraft(value)
    setEditing(true)
  }

  const finish = (save: boolean) => {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)
    if (!save) return
    const next = sanitize(draft)
    if (next && next !== initialRef.current && next !== value) onSave(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      refocusRef.current = true
      finish(true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      refocusRef.current = true
      finish(false)
    }
  }

  if (!editable) {
    return (
      <span className={cn('inline-block min-w-0 truncate align-middle', textClassName, className)} title={value || undefined}>
        {value || placeholder}
      </span>
    )
  }

  if (editing) {
    const widthCh = Math.min(Math.max(draft.length, 6) + 2, maxLength ? maxLength + 2 : 42)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
        onFocus={(e) => e.currentTarget.select()}
        maxLength={maxLength}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        style={{ width: `${widthCh}ch` }}
        className={cn(
          'min-w-0 max-w-full rounded-md border border-accent bg-surface px-2 py-0.5 outline-none',
          'shadow-[0_0_0_3px_rgba(124,140,255,0.18)] placeholder:text-ink-3',
          textClassName,
          className,
        )}
      />
    )
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={start}
      aria-label={value ? `${label}: ${value}` : label}
      title={label}
      className={cn(
        'group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors',
        'hover:bg-white/5',
        className,
      )}
    >
      <span className={cn('min-w-0 truncate', textClassName, !value && 'text-ink-3')}>{value || placeholder}</span>
      <Pencil
        className="size-3.5 shrink-0 text-ink-3 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
  )
}
