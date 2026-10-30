import { Check } from 'lucide-react'
import { AVATAR_STYLES, resolveAvatarStyle } from '@/domain/avatars'
import { cn } from '@/lib/utils'
import { useTable } from '@/store/hooks'
import { Avatar, Modal } from '@/ui/primitives'

const MAX_PREVIEWS = 3

export function AvatarStyleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, participants, dispatch } = useTable()
  const current = resolveAvatarStyle(state?.avatarStyle)
  const previews = participants.slice(0, MAX_PREVIEWS)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Estilo de avatares" description="Cambia cómo se ve toda la mesa.">
      <div className="grid max-h-[60dvh] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
        {AVATAR_STYLES.map((style) => {
          const selected = style.id === current
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={selected}
              onClick={() => dispatch({ type: 'SET_AVATAR_STYLE', style: style.id })}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors',
                selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface/60 hover:bg-surface-2',
              )}
            >
              <span className="flex h-10 items-center -space-x-1">
                {previews.map((p) => (
                  <Avatar key={p.id} id={p.id} name={p.name} size="md" styleId={style.id} decorative />
                ))}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold">
                {selected && <Check className="size-3.5 text-accent" strokeWidth={2} aria-hidden />}
                {style.label}
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
