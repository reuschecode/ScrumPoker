import { HIDDEN_VOTE, type TableState, type UserId } from '@/domain/types'

/**
 * Vista del estado para un cliente: antes de revelar, los votos ajenos viajan como
 * HIDDEN_VOTE y el propio conserva su valor. Si no hay nada que ocultar (ronda revelada
 * o sin votos) devuelve el mismo objeto, así los consumidores pueden memoizar por identidad.
 */
export function projectStateFor(state: TableState, viewerId: UserId): TableState {
  if (state.round.revealed) return state
  const entries = Object.entries(state.round.votes)
  if (entries.length === 0) return state
  const votes = Object.fromEntries(entries.map(([userId, value]) => [userId, userId === viewerId ? value : HIDDEN_VOTE]))
  return { ...state, round: { ...state.round, votes } }
}
