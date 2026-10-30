import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  /** Icono (lucide) a la izquierda, dentro del campo. */
  icon?: ReactNode
  /** Elemento a la derecha, dentro del campo (p. ej. un botón). */
  trailing?: ReactNode
  inputSize?: 'md' | 'lg'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, trailing, inputSize = 'md', className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-surface px-3 transition-[border-color,box-shadow] duration-200',
          'focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgba(124,140,255,0.18)]',
          error ? 'border-danger/60' : 'border-line-strong',
          inputSize === 'lg' ? 'h-12' : 'h-10',
        )}
      >
        {icon && <span className="text-ink-3 shrink-0 [&>svg]:size-4">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn(
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3',
            inputSize === 'lg' ? 'text-base' : 'text-sm',
          )}
          {...rest}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
