import { avatarColor, cn, initials } from '@/lib/utils'

export interface AvatarProps {
  id: string
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Atenúa el avatar (p. ej. desconectado). */
  dimmed?: boolean
  className?: string
}

const sizes = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-lg',
}

export function Avatar({ id, name, size = 'md', dimmed, className }: AvatarProps) {
  const c = avatarColor(id)
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold tracking-wide',
        'ring-2 ring-offset-2 ring-offset-bg transition-opacity duration-300',
        sizes[size],
        dimmed && 'opacity-40 grayscale',
        className,
      )}
      style={{ background: c.bg, color: c.fg, ['--tw-ring-color' as string]: c.ring }}
    >
      {initials(name)}
    </span>
  )
}
