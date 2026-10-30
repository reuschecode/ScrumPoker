import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface LogoProps {
  size?: number
  withText?: boolean
  className?: string
}

/** Marca: dos cartas inclinadas con degradado acento→menta (misma figura que el favicon). */
export function Logo({ size = 28, withText = true, className }: LogoProps) {
  const gradId = useId()
  return (
    <span className={cn('inline-flex select-none items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="shrink-0 drop-shadow-[0_2px_10px_rgba(124,140,255,0.35)]"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-mint)" />
          </linearGradient>
        </defs>
        <rect
          x="8"
          y="6"
          width="36"
          height="50"
          rx="7"
          fill="var(--color-surface)"
          stroke={`url(#${gradId})`}
          strokeWidth="3"
          transform="rotate(-8 26 31)"
        />
        <rect
          x="22"
          y="10"
          width="36"
          height="50"
          rx="7"
          fill="var(--color-bg-elev)"
          stroke={`url(#${gradId})`}
          strokeWidth="3"
          transform="rotate(8 40 35)"
        />
        <text
          x="40"
          y="43"
          fontFamily="Manrope, system-ui, sans-serif"
          fontSize="22"
          fontWeight="800"
          fill={`url(#${gradId})`}
          textAnchor="middle"
          transform="rotate(8 40 35)"
        >
          13
        </text>
      </svg>
      {withText && <span className="text-gradient text-base font-extrabold tracking-tight">Scrum Poker</span>}
    </span>
  )
}
