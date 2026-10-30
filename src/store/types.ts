/**
 * CONTRATO DEL STORE — lo que la UI consume. Implementado en tableStore.ts / hooks.ts / eventBus.ts.
 */
import type { Command, Deck, DeckId, DomainEvent, Participant, TableState, UserId } from '@/domain/types'
import type { ConnectionStatus, Session, SessionSnapshot } from '@/net/protocol'

export interface TableStore {
  session: Session | null
  snapshot: SessionSnapshot | null
  /** Crea la mesa (host), la conecta y devuelve el código. */
  createTable(opts: { tableName: string; deck: DeckId }): Promise<string>
  /**
   * Entra a la mesa `code`. Si en localStorage existe `sp:host:<code>` cuyo hostId es el usuario
   * actual, vuelve a hostear (recuperación tras refresh); si no, se conecta como cliente.
   * Nunca lanza: los fallos se reflejan en `snapshot.status`.
   */
  joinTable(code: string): Promise<void>
  dispatch(cmd: Command): void
  /** Sale de la mesa actual y limpia la sesión (no cierra la mesa si somos host). */
  leaveTable(): void
}

export interface TableView {
  status: ConnectionStatus
  state: TableState | null
  code: string | null
  me: UserId
  role: 'host' | 'client' | null
  isHost: boolean
  isAdmin: boolean
  deck: Deck | null
  /** Mi voto en la ronda actual (valor real), o null. */
  myVote: string | null
  /** Participantes en orden de ingreso. */
  participants: Participant[]
  dispatch(cmd: Command): void
  lastError: SessionSnapshot['lastError']
}

export type EventListener = (events: DomainEvent[], state: TableState) => void

export interface EventBus {
  subscribe(listener: EventListener): () => void
  emit(events: DomainEvent[], state: TableState): void
}

export interface RecentTable {
  code: string
  name: string
  role: 'host' | 'client'
  at: number
}
