import { UserRound } from 'lucide-react'
import { sanitizeName, useIdentity } from '@/store/identity'
import { Avatar } from '@/ui/primitives'

export interface AvatarPreviewProps {
  /** Lo que el usuario lleva escrito como nombre. */
  name: string
  hint: string
}

/** Muestra el avatar que corresponde al nombre mientras se escribe. */
export function AvatarPreview({ name, hint }: AvatarPreviewProps) {
  const id = useIdentity((s) => s.identity.id)
  const clean = sanitizeName(name)
  return (
    <div className="flex items-center gap-4">
      {clean ? (
        <Avatar id={id} name={clean} size="xl" decorative />
      ) : (
        <span
          className="inline-flex size-16 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3"
          aria-hidden
        >
          <UserRound className="size-7" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{clean || 'Tu avatar'}</p>
        <p className="text-xs text-ink-2">{clean ? hint : 'Escribe tu nombre para verlo'}</p>
      </div>
    </div>
  )
}
