import { isAvatarStyleId, resolveAvatarStyle } from '@/domain/avatars'
import {
  LIMITS,
  REACTION_EMOJIS,
  type Action,
  type ChatMessage,
  type DomainError,
  type DomainErrorCode,
  type DomainEvent,
  type HistoryEntry,
  type Participant,
  type ReduceResult,
  type SystemAction,
  type TableState,
  type UserAction,
  type UserId,
} from '@/domain/types'
import { getDeck, isCardOf, isDeckId } from '@/domain/deck'
import { computeStats } from '@/domain/stats'
import {
  isValidUserId,
  messageId,
  newRound,
  roundId,
  sanitizeFreeText,
  sanitizeName,
  sanitizeStory,
  sanitizeTableName,
} from '@/domain/table'
import { getParticipant, getVote, isAdmin } from '@/domain/selectors'

/** Mensajes por defecto, listos para un toast. Cada acción puede afinarlos. */
export const DOMAIN_ERROR_MESSAGES: Record<DomainErrorCode, string> = {
  'invalid-avatar-style': 'Ese estilo de avatar no existe',
  'unknown-round': 'Esa ronda ya no está en el historial',
  'not-admin': 'Solo un admin puede hacer esto',
  'not-host': 'Solo el anfitrión puede hacer esto',
  'not-participant': 'No estás en esta mesa',
  'unknown-user': 'Ese participante no está en la mesa',
  'invalid-card': 'Esa carta no está en el mazo',
  'invalid-emoji': 'Esa reacción no está permitida',
  'invalid-name': 'Escribe un nombre',
  'invalid-text': 'El texto no es válido',
  'invalid-deck': 'Ese mazo no existe',
  empty: 'No hay nada que guardar',
  'already-revealed': 'Los votos ya fueron revelados',
  'not-revealed': 'Primero hay que revelar los votos',
  'no-votes': 'Todavía nadie ha votado',
  'votes-in-progress': 'No puedes cambiar el mazo con votos en curso',
  'cannot-target-host': 'No puedes hacer eso con el anfitrión',
  'cannot-target-self': 'No puedes hacer eso contigo mismo',
  'table-full': `La mesa está llena (máximo ${LIMITS.MAX_PARTICIPANTS})`,
  'table-closed': 'La mesa está cerrada',
  kicked: 'Te expulsaron de esta mesa',
  noop: 'No hay nada que cambiar',
}

export function domainError(code: DomainErrorCode, message: string = DOMAIN_ERROR_MESSAGES[code]): DomainError {
  return { code, message }
}

type SystemActionOf<T extends SystemAction['type']> = Extract<SystemAction, { type: T }>
type UserActionOf<T extends UserAction['type']> = Extract<UserAction, { type: T }>

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

function reject(state: TableState, code: DomainErrorCode, message?: string): ReduceResult {
  return { state, events: [], error: domainError(code, message) }
}

function noop(state: TableState): ReduceResult {
  return { state, events: [] }
}

function apply(state: TableState, patch: Partial<TableState>, events: DomainEvent[]): ReduceResult {
  return { state: { ...state, ...patch, version: state.version + 1 }, events }
}

function requireAdmin(state: TableState, by: UserId, message: string): ReduceResult | null {
  return isAdmin(state, by) ? null : reject(state, 'not-admin', message)
}

function patchParticipant(state: TableState, userId: UserId, patch: Partial<Participant>): Participant[] {
  return state.participants.map((p) => (p.id === userId ? { ...p, ...patch } : p))
}

function hasVotes(state: TableState): boolean {
  return Object.keys(state.round.votes).length > 0
}

// `Object.fromEntries` crea propiedades propias: evita que un id como '__proto__' toque el prototipo.
function omitVote(votes: Record<UserId, string>, userId: UserId): Record<UserId, string> {
  return Object.fromEntries(Object.entries(votes).filter(([id]) => id !== userId))
}

/**
 * Retira al usuario de participantes. Antes de revelar también retira su voto; con la ronda revelada
 * lo conserva junto con su nombre, para que no cambien los resultados ni el historial.
 */
function withoutUser(state: TableState, participant: Participant): Partial<TableState> {
  const { id } = participant
  const { round } = state
  const patch: Partial<TableState> = { participants: state.participants.filter((p) => p.id !== id) }
  if (Object.hasOwn(round.votes, id)) {
    patch.round = round.revealed
      ? { ...round, departedNames: { ...round.departedNames, [id]: participant.name } }
      : { ...round, votes: omitVote(round.votes, id) }
  }
  return patch
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Reducer puro y determinista de la mesa. Nunca lanza ni muta la entrada: una acción
 * rechazada devuelve el mismo estado con `error`; una sin efecto devuelve el mismo estado
 * sin error ni eventos (el host compara identidad para no difundir).
 */
export function reduce(state: TableState, action: Action): ReduceResult {
  try {
    return reduceChecked(state, action)
  } catch {
    // Acción malformada (p. ej. un cliente hostil): la excepción nunca sale del reducer.
    return reject(state, 'invalid-text', 'No se pudo aplicar la acción')
  }
}

function reduceChecked(state: TableState, action: Action): ReduceResult {
  if (state.closed) return reject(state, 'table-closed')
  switch (action.type) {
    case 'JOIN':
      return join(state, action)
    case 'DISCONNECT':
      return disconnect(state, action)
    case 'LEAVE':
      return leave(state, action)
    default:
      return reduceUserAction(state, action)
  }
}

function reduceUserAction(state: TableState, action: UserAction): ReduceResult {
  const actor = getParticipant(state, action.by)
  if (!actor) return reject(state, 'not-participant')
  switch (action.type) {
    case 'SET_NAME':
      return setName(state, action, actor)
    case 'SET_TABLE_NAME':
      return setTableName(state, action)
    case 'SET_AVATAR_STYLE':
      return setAvatarStyle(state, action)
    case 'SET_DECK':
      return setDeck(state, action)
    case 'SET_STORY':
      return setStory(state, action)
    case 'VOTE':
      return vote(state, action)
    case 'CLEAR_VOTE':
      return clearVote(state, action)
    case 'REVEAL':
      return reveal(state, action)
    case 'RESET_ROUND':
      return resetRound(state, action)
    case 'FINISH_ROUND':
      return finishRound(state, action)
    case 'UPDATE_HISTORY_ENTRY':
      return updateHistoryEntry(state, action)
    case 'KICK':
      return kick(state, action)
    case 'GRANT_ADMIN':
      return grantAdmin(state, action)
    case 'REVOKE_ADMIN':
      return revokeAdmin(state, action)
    case 'CHAT':
      return chat(state, action, actor)
    case 'REACT':
      return react(state, action)
    case 'CLOSE_TABLE':
      return closeTable(state, action)
    default:
      return reject(state, 'invalid-text', 'Acción no válida')
  }
}

// ---------------------------------------------------------------------------
// Comandos de sistema (solo los genera el host)
// ---------------------------------------------------------------------------

function join(state: TableState, action: SystemActionOf<'JOIN'>): ReduceResult {
  const id: unknown = action.user?.id
  if (!isValidUserId(id)) return reject(state, 'invalid-text', 'Identificador no válido')
  if (state.kicked.includes(id)) return reject(state, 'kicked')

  const name = sanitizeName(str(action.user.name))
  const existing = getParticipant(state, id)
  if (existing) {
    // Reconexión: un nombre vacío no borra el que ya tenía.
    const nextName = name || existing.name
    const renamed = nextName !== existing.name
    if (existing.connected && !renamed) return noop(state)
    const events: DomainEvent[] = []
    if (renamed) events.push({ type: 'participant.renamed', userId: id, name: nextName, previous: existing.name })
    if (!existing.connected) events.push({ type: 'participant.reconnected', userId: id })
    return apply(state, { participants: patchParticipant(state, id, { connected: true, name: nextName }) }, events)
  }

  if (!name) return reject(state, 'invalid-name', 'Necesitas un nombre para entrar')
  if (state.participants.length >= LIMITS.MAX_PARTICIPANTS) return reject(state, 'table-full')
  const participant: Participant = { id, name, joinedAt: action.at, connected: true }
  return apply(state, { participants: [...state.participants, participant] }, [
    { type: 'participant.joined', userId: id, name },
  ])
}

function disconnect(state: TableState, action: SystemActionOf<'DISCONNECT'>): ReduceResult {
  const userId = str(action.userId)
  if (userId === state.hostId) {
    return reject(state, 'cannot-target-host', 'El anfitrión no se desconecta de su propia mesa')
  }
  const participant = getParticipant(state, userId)
  if (!participant || !participant.connected) return noop(state)
  return apply(state, { participants: patchParticipant(state, userId, { connected: false }) }, [
    { type: 'participant.disconnected', userId },
  ])
}

function leave(state: TableState, action: SystemActionOf<'LEAVE'>): ReduceResult {
  const userId = str(action.userId)
  if (userId === state.hostId) {
    return reject(state, 'cannot-target-host', 'El anfitrión no sale de la mesa: puede cerrarla')
  }
  const participant = getParticipant(state, userId)
  if (!participant) return noop(state)
  return apply(state, withoutUser(state, participant), [{ type: 'participant.left', userId, name: participant.name }])
}

// ---------------------------------------------------------------------------
// Comandos de usuario
// ---------------------------------------------------------------------------

function setName(state: TableState, action: UserActionOf<'SET_NAME'>, actor: Participant): ReduceResult {
  const name = sanitizeName(str(action.name))
  if (!name) return reject(state, 'invalid-name', 'Escribe un nombre')
  if (name === actor.name) return noop(state)
  return apply(state, { participants: patchParticipant(state, actor.id, { name }) }, [
    { type: 'participant.renamed', userId: actor.id, name, previous: actor.name },
  ])
}

function setTableName(state: TableState, action: UserActionOf<'SET_TABLE_NAME'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede renombrar la mesa')
  if (denied) return denied
  const name = sanitizeTableName(str(action.name))
  if (!name) return reject(state, 'invalid-name', 'La mesa necesita un nombre')
  if (name === state.name) return noop(state)
  return apply(state, { name }, [{ type: 'table.renamed', name, by: action.by }])
}

function setDeck(state: TableState, action: UserActionOf<'SET_DECK'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede cambiar el mazo')
  if (denied) return denied
  const deck: unknown = action.deck
  if (!isDeckId(deck)) return reject(state, 'invalid-deck')
  if (deck === state.deck) return noop(state)
  if (hasVotes(state)) return reject(state, 'votes-in-progress', 'Reinicia la votación antes de cambiar el mazo')
  return apply(state, { deck }, [{ type: 'deck.changed', deck, by: action.by }])
}

function setAvatarStyle(state: TableState, action: UserActionOf<'SET_AVATAR_STYLE'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede cambiar los avatares')
  if (denied) return denied
  const style: unknown = action.style
  if (!isAvatarStyleId(style)) return reject(state, 'invalid-avatar-style')
  if (style === resolveAvatarStyle(state.avatarStyle)) return noop(state)
  return apply(state, { avatarStyle: style }, [{ type: 'avatarStyle.changed', style, by: action.by }])
}

function setStory(state: TableState, action: UserActionOf<'SET_STORY'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede cambiar la historia')
  if (denied) return denied
  const story = sanitizeStory(str(action.story))
  if (story === state.round.story) return noop(state)
  return apply(state, { round: { ...state.round, story } }, [{ type: 'story.changed', story, by: action.by }])
}

function vote(state: TableState, action: UserActionOf<'VOTE'>): ReduceResult {
  if (state.round.revealed) {
    return reject(state, 'already-revealed', 'Los votos ya fueron revelados; espera la siguiente ronda')
  }
  const value = str(action.value)
  if (!value || !isCardOf(getDeck(state.deck), value)) return reject(state, 'invalid-card')
  const previous = getVote(state, action.by)
  if (previous === value) return noop(state)
  const round = { ...state.round, votes: { ...state.round.votes, [action.by]: value } }
  return apply(state, { round }, [{ type: 'vote.cast', userId: action.by, changed: previous !== null }])
}

function clearVote(state: TableState, action: UserActionOf<'CLEAR_VOTE'>): ReduceResult {
  if (state.round.revealed) return reject(state, 'already-revealed', 'Ya no puedes cambiar tu voto')
  if (!Object.hasOwn(state.round.votes, action.by)) return noop(state)
  const round = { ...state.round, votes: omitVote(state.round.votes, action.by) }
  return apply(state, { round }, [{ type: 'vote.cleared', userId: action.by }])
}

function reveal(state: TableState, action: UserActionOf<'REVEAL'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede revelar los votos')
  if (denied) return denied
  if (state.round.revealed) return reject(state, 'already-revealed')
  if (!hasVotes(state)) return reject(state, 'no-votes', 'Todavía nadie ha votado')
  const round = { ...state.round, revealed: true, revealedAt: action.at }
  const stats = computeStats(round.votes, getDeck(state.deck))
  return apply(state, { round }, [{ type: 'round.revealed', by: action.by, roundId: round.id, stats }])
}

function resetRound(state: TableState, action: UserActionOf<'RESET_ROUND'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede reiniciar la votación')
  if (denied) return denied
  if (!hasVotes(state) && !state.round.revealed) return noop(state)
  const round = newRound({
    id: roundId(state.version + 1),
    number: state.round.number,
    story: state.round.story,
    startedAt: action.at,
  })
  return apply(state, { round }, [{ type: 'round.reset', by: action.by }])
}

/** Votos de la ronda en orden de participantes; los de quienes ya salieron van al final. */
function collectVotes(state: TableState): HistoryEntry['votes'] {
  const votes = state.round.votes
  const departed = state.round.departedNames ?? {}
  const out: HistoryEntry['votes'] = []
  const seen = new Set<UserId>()
  for (const p of state.participants) {
    if (!Object.hasOwn(votes, p.id)) continue
    out.push({ userId: p.id, name: p.name, value: votes[p.id] })
    seen.add(p.id)
  }
  for (const [userId, value] of Object.entries(votes)) {
    if (!seen.has(userId)) out.push({ userId, name: Object.hasOwn(departed, userId) ? departed[userId] : 'Participante', value })
  }
  return out
}

function finishRound(state: TableState, action: UserActionOf<'FINISH_ROUND'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede cerrar la ronda')
  if (denied) return denied
  if (!state.round.revealed) return reject(state, 'not-revealed', 'Revela los votos antes de cerrar la ronda')
  if (!hasVotes(state)) return reject(state, 'empty')
  const finalScore = sanitizeFreeText(str(action.finalScore))
  if (!finalScore || finalScore.length > LIMITS.MAX_FINAL_SCORE) {
    return reject(state, 'invalid-text', `Escribe un puntaje final (máximo ${LIMITS.MAX_FINAL_SCORE} caracteres)`)
  }
  const entry: HistoryEntry = {
    roundId: state.round.id,
    number: state.round.number,
    story: state.round.story,
    finalScore,
    votes: collectVotes(state),
    stats: computeStats(state.round.votes, getDeck(state.deck)),
    finishedAt: action.at,
    finishedBy: action.by,
  }
  const history = [...state.history, entry].slice(-LIMITS.MAX_HISTORY)
  const round = newRound({
    id: roundId(state.version + 1),
    number: state.round.number + 1,
    story: sanitizeStory(str(action.nextStory)),
    startedAt: action.at,
  })
  return apply(state, { history, round }, [{ type: 'round.finished', by: action.by, entry }])
}

function updateHistoryEntry(state: TableState, action: UserActionOf<'UPDATE_HISTORY_ENTRY'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede editar el historial')
  if (denied) return denied
  const roundId = str(action.roundId)
  const index = state.history.findIndex((e) => e.roundId === roundId)
  if (index < 0) return reject(state, 'unknown-round', 'Esa ronda ya no está en el historial')
  const entry = state.history[index]

  const changes: Extract<DomainEvent, { type: 'history.entryUpdated' }>['changes'] = {}
  const patch: Partial<HistoryEntry> = {}
  if (action.finalScore !== undefined) {
    const finalScore = sanitizeFreeText(str(action.finalScore))
    if (!finalScore || finalScore.length > LIMITS.MAX_FINAL_SCORE) {
      return reject(state, 'invalid-text', `Escribe un puntaje final (máximo ${LIMITS.MAX_FINAL_SCORE} caracteres)`)
    }
    if (finalScore !== entry.finalScore) {
      patch.finalScore = finalScore
      changes.finalScore = { from: entry.finalScore, to: finalScore }
    }
  }
  if (action.story !== undefined) {
    // Como al jugarla, la historia puede quedar vacía ("Sin nombre").
    const story = sanitizeStory(str(action.story))
    if (story !== entry.story) {
      patch.story = story
      changes.story = { from: entry.story, to: story }
    }
  }
  if (!changes.finalScore && !changes.story) return noop(state)

  const history = state.history.map((e, i) => (i === index ? { ...e, ...patch } : e))
  return apply(state, { history }, [
    { type: 'history.entryUpdated', roundId, number: entry.number, changes, by: action.by },
  ])
}

function kick(state: TableState, action: UserActionOf<'KICK'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede expulsar participantes')
  if (denied) return denied
  const target = str(action.userId)
  if (target === action.by) return reject(state, 'cannot-target-self', 'No puedes expulsarte a ti mismo')
  if (target === state.hostId) return reject(state, 'cannot-target-host', 'No puedes expulsar al anfitrión')
  const participant = getParticipant(state, target)
  if (!participant) {
    return state.kicked.includes(target)
      ? noop(state)
      : reject(state, 'unknown-user', 'Ese participante ya no está en la mesa')
  }
  // A diferencia de LEAVE, expulsar sí retira el rol: quien sale y vuelve conserva su rol de admin.
  const admins = state.admins.filter((id) => id !== target)
  return apply(state, { ...withoutUser(state, participant), admins, kicked: [...state.kicked, target] }, [
    { type: 'participant.kicked', userId: target, name: participant.name, by: action.by },
  ])
}

function grantAdmin(state: TableState, action: UserActionOf<'GRANT_ADMIN'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede nombrar admins')
  if (denied) return denied
  const target = str(action.userId)
  if (!getParticipant(state, target)) return reject(state, 'unknown-user')
  if (state.admins.includes(target)) return noop(state)
  return apply(state, { admins: [...state.admins, target] }, [{ type: 'admin.granted', userId: target, by: action.by }])
}

function revokeAdmin(state: TableState, action: UserActionOf<'REVOKE_ADMIN'>): ReduceResult {
  const denied = requireAdmin(state, action.by, 'Solo un admin puede quitar admins')
  if (denied) return denied
  const target = str(action.userId)
  if (target === state.hostId) return reject(state, 'cannot-target-host', 'El anfitrión siempre es admin')
  if (!state.admins.includes(target)) return noop(state)
  return apply(state, { admins: state.admins.filter((id) => id !== target) }, [
    { type: 'admin.revoked', userId: target, by: action.by },
  ])
}

function chat(state: TableState, action: UserActionOf<'CHAT'>, actor: Participant): ReduceResult {
  const text = sanitizeFreeText(str(action.text))
  if (!text || text.length > LIMITS.MAX_CHAT_TEXT) {
    return reject(state, 'invalid-text', `El mensaje está vacío o supera ${LIMITS.MAX_CHAT_TEXT} caracteres`)
  }
  const message: ChatMessage = {
    id: messageId(state.version + 1),
    userId: actor.id,
    name: actor.name,
    text,
    at: action.at,
  }
  const chatLog = [...state.chat, message].slice(-LIMITS.MAX_CHAT_MESSAGES)
  return apply(state, { chat: chatLog }, [{ type: 'chat.message', message }])
}

function react(state: TableState, action: UserActionOf<'REACT'>): ReduceResult {
  const emoji = str(action.emoji)
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return reject(state, 'invalid-emoji')
  const participants = patchParticipant(state, action.by, { reaction: { emoji, at: action.at } })
  return apply(state, { participants }, [{ type: 'reaction', userId: action.by, emoji }])
}

function closeTable(state: TableState, action: UserActionOf<'CLOSE_TABLE'>): ReduceResult {
  if (action.by !== state.hostId) return reject(state, 'not-host', 'Solo el anfitrión puede cerrar la mesa')
  return apply(state, { closed: true }, [{ type: 'table.closed', by: action.by }])
}
