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

/** Mensajes posteriores al último leído; si ese ya salió del chat, todos cuentan como no leídos. */
export function countUnread(chat: ReadonlyArray<{ id: string }>, lastReadId: string | null): number {
  for (let i = chat.length - 1; i >= 0; i--) {
    if (chat[i].id === lastReadId) return chat.length - 1 - i
  }
  return chat.length
}
