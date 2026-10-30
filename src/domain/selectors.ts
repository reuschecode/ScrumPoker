import type { Deck, Participant, TableState, UserId } from '@/domain/types'
import { getDeck } from '@/domain/deck'

export function isHost(state: TableState, userId: UserId): boolean {
  return state.hostId === userId
}

export function isAdmin(state: TableState, userId: UserId): boolean {
  return state.admins.includes(userId)
}

export function getParticipant(state: TableState, userId: UserId): Participant | undefined {
  return state.participants.find((p) => p.id === userId)
}

/** Voto del usuario en la ronda actual (en una proyección puede ser HIDDEN_VOTE), o null. */
export function getVote(state: TableState, userId: UserId): string | null {
  return Object.hasOwn(state.round.votes, userId) ? state.round.votes[userId] : null
}

export function hasVoted(state: TableState, userId: UserId): boolean {
  return Object.hasOwn(state.round.votes, userId)
}

export function voteCount(state: TableState): number {
  return Object.keys(state.round.votes).length
}

/** Participantes con voto, en orden de ingreso. */
export function votedIds(state: TableState): UserId[] {
  return state.participants.filter((p) => hasVoted(state, p.id)).map((p) => p.id)
}

export function connectedParticipants(state: TableState): Participant[] {
  return state.participants.filter((p) => p.connected)
}

/** Participantes conectados que todavía no votan. */
export function pendingVoters(state: TableState): Participant[] {
  return state.participants.filter((p) => p.connected && !hasVoted(state, p.id))
}

/** true si todos los participantes conectados han votado (false si no hay nadie conectado). */
export function allVoted(state: TableState): boolean {
  const connected = connectedParticipants(state)
  return connected.length > 0 && connected.every((p) => hasVoted(state, p.id))
}

export function currentDeck(state: TableState): Deck {
  return getDeck(state.deck)
}
