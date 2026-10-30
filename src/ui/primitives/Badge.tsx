import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'mint' | 'warn' | 'danger'
  icon?: ReactNode
}

const tones = {
  neutral: 'bg-white/6 text-ink-2 border-line',
  accent: 'bg-accent-soft text-accent border-accent/30',
  mint: 'bg-mint-soft text-mint border-mint/30',
  warn: 'bg-warn-soft text-warn border-warn/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
}

export function Badge({ tone = 'neutral', icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 [&>svg]:size-3',
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}
