import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'mint'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Icono (lucide) a la izquierda. */
  icon?: ReactNode
  /** Icono a la derecha. */
  iconRight?: ReactNode
  block?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-bg hover:bg-accent-strong shadow-[0_8px_24px_-8px_rgba(124,140,255,0.7)] active:translate-y-px',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line-strong active:translate-y-px',
  ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-white/5',
  danger: 'bg-danger-soft text-danger hover:bg-danger/25 border border-danger/30 active:translate-y-px',
  mint: 'bg-mint text-[#062a21] hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(94,225,193,0.6)] active:translate-y-px',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
        'transition-[background-color,transform,box-shadow,color,filter] duration-200 ease-[var(--ease-smooth)]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
})
