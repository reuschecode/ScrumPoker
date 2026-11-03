import { create } from 'zustand'

/**
 * Lectura del chat: último mensaje visto mientras el panel estuvo activo. Se guarda el id y no un
 * contador porque el chat recorta los mensajes viejos al llegar a su tope y su longitud deja de crecer.
 * Es estado puramente local a esta pestaña, por eso vive fuera del estado de la mesa.
 */
interface UnreadStore {
  /** Mesa a la que pertenece `lastReadId`; con otro código no hay nada leído. */
  code: string | null
  lastReadId: string | null
  markRead: (code: string, lastId: string | null) => void
  reset: () => void
}

export const useUnreadStore = create<UnreadStore>((set) => ({
  code: null,
  lastReadId: null,
  // Devuelve el mismo estado si no cambia nada para no notificar a los suscriptores.
  markRead: (code, lastId) =>
    set((s) => (s.code === code && s.lastReadId === lastId ? s : { code, lastReadId: lastId })),
  reset: () => set({ code: null, lastReadId: null }),
}))

/**
 * Mensajes de personas posteriores al último leído; si ese ya salió del chat, cuentan todos.
 * Los avisos de conexión no suman: no son conversación.
 */
export function countUnread(chat: ReadonlyArray<{ id: string; system?: unknown }>, lastReadId: string | null): number {
  let count = 0
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].id === lastReadId) return count
    if (!chat[i].system) count++
  }
  return count
}
