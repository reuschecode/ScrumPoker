import { resolveAvatarStyle, type AvatarStyleId } from '@/domain/avatars'
import { avatarColor, cn, initials } from '@/lib/utils'
import { useTableStore } from '@/store/tableStore'
import { useAvatarImage } from './avatarImage'

export interface AvatarProps {
  id: string
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Atenúa el avatar (p. ej. desconectado). */
  dimmed?: boolean
  className?: string
  /** Fuerza un estilo (vista previa). Por defecto, el de la mesa. */
  styleId?: AvatarStyleId
  /** Lo nombra el texto contiguo: no se anuncia como imagen. */
  decorative?: boolean
}

const sizes = {
  sm: 'size-7 text-[10px]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-lg',
}

export function Avatar({ id, name, size = 'md', dimmed, className, styleId, decorative }: AvatarProps) {
  const c = avatarColor(id)
  const tableStyle = useTableStore((s) => s.snapshot?.state?.avatarStyle)
  const image = useAvatarImage(styleId ?? resolveAvatarStyle(tableStyle), id)
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold tracking-wide',
        'ring-2 ring-offset-2 ring-offset-bg transition-opacity duration-300',
        sizes[size],
        dimmed && 'opacity-40 grayscale',
        className,
      )}
      style={{ background: c.bg, color: c.fg, ['--tw-ring-color' as string]: c.ring }}
    >
      {image ? <img src={image} alt="" draggable={false} className="size-full object-cover" /> : initials(name)}
    </span>
  )
}
