/**
 * CONTRATO DEL DOMINIO — Scrum Poker
 *
 * Modelo: la mesa es "host-autoritativa". El navegador del creador (host) mantiene el
 * estado real, aplica los comandos con el reducer puro (`reduce`) y difunde a cada
 * cliente una *proyección* del estado (`projectStateFor`) en la que los votos ajenos
 * están ocultos hasta que un administrador revela la ronda.
 *
 * Reglas de oro:
 *  - El reducer es puro y determinista: toda marca de tiempo viene en la acción (`at`).
 *  - Los comandos de usuario (`Command`) NO llevan autor: el host les estampa `by`
 *    a partir de la conexión autenticada (id + secreto). Nunca se confía en el cliente.
 *  - Los comandos de sistema (`SystemCommand`) solo los genera el host.
 */

import type { AvatarStyleId } from '@/domain/avatars'

export type UserId = string

// ---------------------------------------------------------------------------
// Límites y constantes
// ---------------------------------------------------------------------------

export const LIMITS = {
  MAX_PARTICIPANTS: 24,
  MAX_NAME: 24,
  MAX_TABLE_NAME: 40,
  MAX_STORY: 140,
  MAX_CHAT_TEXT: 500,
  MAX_CHAT_MESSAGES: 200,
  MAX_HISTORY: 500,
  MAX_FINAL_SCORE: 12,
} as const

/** Valor que ve un cliente en `round.votes` para un voto ajeno aún no revelado. */
export const HIDDEN_VOTE = '•'

/** Tiempo que una reacción se muestra sobre el participante (ms). */
export const REACTION_TTL_MS = 4000

/** Gracia tras una desconexión antes de retirar al participante de la mesa (ms). */
export const DISCONNECT_GRACE_MS = 20_000

/** Emojis permitidos como reacción. */
export const REACTION_EMOJIS = ['👍', '👎', '🎉', '😂', '🤔', '❤️', '🔥', '👏', '😮', '☕'] as const
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

// ---------------------------------------------------------------------------
// Mazos
// ---------------------------------------------------------------------------

export type DeckId = 'fibonacci' | 'modified' | 'tshirt' | 'powers'

export interface Deck {
  id: DeckId
  label: string
  description: string
  /** Cartas en orden. Las especiales son '?' (no sé) y '☕' (pausa). */
  cards: readonly string[]
}

export const SPECIAL_CARDS = ['?', '☕'] as const

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export interface Participant {
  id: UserId
  name: string
  joinedAt: number
  /** false mientras está en el período de gracia tras perder la conexión. */
  connected: boolean
  /** Última reacción; la UI la muestra mientras `now - at < REACTION_TTL_MS`. */
  reaction?: { emoji: string; at: number }
}

export interface Round {
  id: string
  /** 1-based, se incrementa al finalizar cada ronda. */
  number: number
  /** Nombre de la historia de usuario que se está puntuando. */
  story: string
  /**
   * Votos por participante. En el estado autoritativo (host) contiene el valor real.
   * En la proyección que recibe un cliente, los votos ajenos valen `HIDDEN_VOTE`
   * mientras `revealed === false`; el propio siempre es visible.
   */
  votes: Record<UserId, string>
  revealed: boolean
  startedAt: number
  revealedAt: number | null
  /**
   * Nombres de quienes salieron o fueron expulsados con la ronda ya revelada. Su voto sigue en
   * `votes` para los resultados y el historial, pero ya no están en `participants`.
   */
  departedNames?: Record<UserId, string>
}

export interface VoteStats {
  /** Total de votos emitidos (incluye '?' y '☕'). */
  count: number
  /** Votos con valor numérico. */
  numericCount: number
  average: number | null
  median: number | null
  /** Valor(es) más votado(s); varios si hay empate. Orden del mazo. */
  mode: string[]
  /** Distribución en orden del mazo; solo valores con al menos un voto. */
  distribution: Array<{ value: string; count: number; voters: UserId[] }>
  /**
   * true si hay ≥2 votos no especiales (ni '?' ni '☕') y todos coinciden; vale también para
   * tallas. Las cartas especiales no rompen el consenso: quien las usa no está estimando.
   */
  consensus: boolean
  /**
   * Carta del mazo que se propone como puntaje final: la moda si es única,
   * si no la carta del mazo más cercana al promedio; null si no hay votos numéricos
   * (en ese caso, la moda si existe).
   */
  suggested: string | null
}

export interface HistoryEntry {
  roundId: string
  number: number
  story: string
  /** Puntaje decidido por un administrador (puede diferir de la sugerencia). */
  finalScore: string
  votes: Array<{ userId: UserId; name: string; value: string }>
  stats: VoteStats
  finishedAt: number
  finishedBy: UserId
}

export interface ChatMessage {
  id: string
  userId: UserId
  name: string
  text: string
  at: number
}

export interface TableState {
  code: string
  name: string
  /** Creador de la mesa. Siempre es admin; no puede ser expulsado ni degradado. */
  hostId: UserId
  admins: UserId[]
  deck: DeckId
  /** Ausente en mesas guardadas por versiones anteriores: usar resolveAvatarStyle. */
  avatarStyle?: AvatarStyleId
  participants: Participant[]
  round: Round
  history: HistoryEntry[]
  chat: ChatMessage[]
  /** Usuarios expulsados: no pueden volver a entrar. */
  kicked: UserId[]
  closed: boolean
  createdAt: number
  /** Se incrementa con cada acción aplicada (útil para ignorar snapshots viejos). */
  version: number
}

// ---------------------------------------------------------------------------
// Comandos (intenciones de usuario) — el host les estampa `by` y `at`
// ---------------------------------------------------------------------------

export type Command =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_TABLE_NAME'; name: string } // admin
  | { type: 'SET_DECK'; deck: DeckId } // admin; solo si la ronda actual no tiene votos
  | { type: 'SET_AVATAR_STYLE'; style: AvatarStyleId } // admin
  | { type: 'SET_STORY'; story: string } // admin
  | { type: 'VOTE'; value: string } // carta del mazo actual; no permitido tras revelar
  | { type: 'CLEAR_VOTE' } // no permitido tras revelar
  | { type: 'REVEAL' } // admin; requiere ≥1 voto
  | { type: 'RESET_ROUND' } // admin; vuelve a ocultar y borra votos SIN guardar historial
  | { type: 'FINISH_ROUND'; finalScore: string; nextStory?: string } // admin; requiere revealed; guarda historial y abre nueva ronda
  /** admin; corrige una ronda del historial: solo su historia y su puntaje final. Los campos ausentes no cambian. */
  | { type: 'UPDATE_HISTORY_ENTRY'; roundId: string; story?: string; finalScore?: string }
  | { type: 'KICK'; userId: UserId } // admin; no al host ni a uno mismo
  | { type: 'GRANT_ADMIN'; userId: UserId } // admin
  | { type: 'REVOKE_ADMIN'; userId: UserId } // admin; no al host
  | { type: 'CHAT'; text: string }
  | { type: 'REACT'; emoji: string } // debe estar en REACTION_EMOJIS
  | { type: 'CLOSE_TABLE' } // solo host

/** Comandos que solo genera el host a partir de eventos de conexión. */
export type SystemCommand =
  | { type: 'JOIN'; user: { id: UserId; name: string } } // reconexión si ya existe
  | { type: 'DISCONNECT'; userId: UserId } // marca connected=false
  | { type: 'LEAVE'; userId: UserId } // retira al participante (tras la gracia o "bye")

export type UserAction = Command & { by: UserId; at: number }
export type SystemAction = SystemCommand & { at: number }
export type Action = UserAction | SystemAction

// ---------------------------------------------------------------------------
// Eventos de dominio — para sonidos, toasts y animaciones
// ---------------------------------------------------------------------------

export type DomainEvent =
  | { type: 'participant.joined'; userId: UserId; name: string }
  | { type: 'participant.reconnected'; userId: UserId }
  | { type: 'participant.disconnected'; userId: UserId }
  | { type: 'participant.left'; userId: UserId; name: string }
  | { type: 'participant.kicked'; userId: UserId; name: string; by: UserId }
  | { type: 'participant.renamed'; userId: UserId; name: string; previous: string }
  | { type: 'table.renamed'; name: string; by: UserId }
  | { type: 'table.closed'; by: UserId }
  | { type: 'deck.changed'; deck: DeckId; by: UserId }
  | { type: 'avatarStyle.changed'; style: AvatarStyleId; by: UserId }
  | { type: 'story.changed'; story: string; by: UserId }
  | { type: 'vote.cast'; userId: UserId; changed: boolean } // el valor nunca viaja en el evento
  | { type: 'vote.cleared'; userId: UserId }
  | { type: 'round.revealed'; by: UserId; roundId: string; stats: VoteStats }
  | { type: 'round.reset'; by: UserId }
  | { type: 'round.finished'; by: UserId; entry: HistoryEntry }
  | {
      type: 'history.entryUpdated'
      roundId: string
      number: number
      /** Solo los campos que cambiaron, con su valor anterior. */
      changes: { story?: { from: string; to: string }; finalScore?: { from: string; to: string } }
      by: UserId
    }
  | { type: 'admin.granted'; userId: UserId; by: UserId }
  | { type: 'admin.revoked'; userId: UserId; by: UserId }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'reaction'; userId: UserId; emoji: string }

// ---------------------------------------------------------------------------
// Resultado del reducer
// ---------------------------------------------------------------------------

export type DomainErrorCode =
  | 'not-admin'
  | 'not-host'
  | 'not-participant'
  | 'unknown-user'
  | 'invalid-card'
  | 'invalid-emoji'
  | 'invalid-name'
  | 'invalid-text'
  | 'invalid-deck'
  | 'invalid-avatar-style'
  | 'unknown-round'
  | 'empty'
  | 'already-revealed'
  | 'not-revealed'
  | 'no-votes'
  | 'votes-in-progress'
  | 'cannot-target-host'
  | 'cannot-target-self'
  | 'table-full'
  | 'table-closed'
  | 'kicked'
  | 'noop'

export interface DomainError {
  code: DomainErrorCode
  /** Mensaje en español listo para mostrar al usuario. */
  message: string
}

export interface ReduceResult {
  state: TableState
  events: DomainEvent[]
  /** Si existe, la acción fue rechazada y `state` es el estado de entrada sin cambios. */
  error?: DomainError
}
