import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Etiqueta accesible obligatoria (también se usa como tooltip nativo). */
  label: string
  icon: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'solid' | 'danger'
  active?: boolean
}

const sizes = { sm: 'size-8 rounded-md', md: 'size-10 rounded-lg', lg: 'size-12 rounded-xl' }
const variants = {
  ghost: 'text-ink-2 hover:text-ink hover:bg-white/5',
  solid: 'bg-surface-2 text-ink border border-line-strong hover:bg-surface-3',
  danger: 'text-danger hover:bg-danger-soft',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', variant = 'ghost', active, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center shrink-0 transition-colors duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizes[size],
        variants[variant],
        active && 'bg-accent-soft text-accent',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
})
