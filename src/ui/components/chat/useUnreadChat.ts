import { useTable } from '@/store/hooks'
import { countUnread, useUnreadStore } from '@/ui/components/chat/unreadStore'

/** Mensajes de chat que todavía no se han visto en el panel (badge de la pestaña o del drawer). */
export function useUnreadChat(): number {
  const { state, code } = useTable()
  const lastReadId = useUnreadStore((s) => (code !== null && s.code === code ? s.lastReadId : null))
  return countUnread(state?.chat ?? [], lastReadId)
}
