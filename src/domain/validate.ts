/**
 * Validación en tiempo de ejecución de un TableState que llega de fuera del reducer: de localStorage
 * o de quien actúa como host. Comprueba todo lo que la UI da por hecho al renderizar.
 *
 * Los campos opcionales aceptan null: el serializador binario de PeerJS convierte undefined en null.
 */
import type { DomainEvent, TableState } from '@/domain/types'
import { isAvatarStyleId } from '@/domain/avatars'
import { isDeckId } from '@/domain/deck'
import { isValidUserId } from '@/domain/table'

type Obj = Record<string, unknown>

/** Límite de `Date`: un `at` mayor hace que `toISOString()` lance durante el render. */
const MAX_TIMESTAMP = 8.64e15

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isNumOrNull = (x: unknown): boolean => x === null || isNum(x)
const isTimestamp = (x: unknown): boolean => isNum(x) && Math.abs(x) <= MAX_TIMESTAMP
const isStrArray = (x: unknown): boolean => Array.isArray(x) && x.every(isStr)
const isStrRecord = (x: unknown): boolean => isObj(x) && Object.values(x).every(isStr)

function isParticipant(x: unknown): boolean {
  if (!isObj(x)) return false
  const reaction = x.reaction
  return (
    isValidUserId(x.id) &&
    isStr(x.name) &&
    isTimestamp(x.joinedAt) &&
    typeof x.connected === 'boolean' &&
    (reaction == null || (isObj(reaction) && isStr(reaction.emoji) && isTimestamp(reaction.at)))
  )
}

function isRound(x: unknown): boolean {
  if (!isObj(x)) return false
  return (
    isStr(x.id) &&
    isNum(x.number) &&
    isStr(x.story) &&
    isStrRecord(x.votes) &&
    typeof x.revealed === 'boolean' &&
    isTimestamp(x.startedAt) &&
    (x.revealedAt === null || isTimestamp(x.revealedAt)) &&
    (x.departedNames == null || isStrRecord(x.departedNames))
  )
}

function isVoteStats(x: unknown): boolean {
  if (!isObj(x)) return false
  return (
    isNum(x.count) &&
    isNum(x.numericCount) &&
    isNumOrNull(x.average) &&
    isNumOrNull(x.median) &&
    isStrArray(x.mode) &&
    Array.isArray(x.distribution) &&
    x.distribution.every((d) => isObj(d) && isStr(d.value) && isNum(d.count) && isStrArray(d.voters)) &&
    typeof x.consensus === 'boolean' &&
    (x.suggested === null || isStr(x.suggested))
  )
}

function isHistoryEntry(x: unknown): boolean {
  if (!isObj(x)) return false
  return (
    isStr(x.roundId) &&
    isNum(x.number) &&
    isStr(x.story) &&
    isStr(x.finalScore) &&
    Array.isArray(x.votes) &&
    x.votes.every((v) => isObj(v) && isStr(v.userId) && isStr(v.name) && isStr(v.value)) &&
    isVoteStats(x.stats) &&
    isTimestamp(x.finishedAt) &&
    isStr(x.finishedBy)
  )
}

function isChatMessage(x: unknown): boolean {
  if (!isObj(x)) return false
  const system = x.system
  const systemOk = system == null || system === 'joined' || system === 'reconnected' || system === 'disconnected' || system === 'left'
  return isStr(x.id) && isStr(x.userId) && isStr(x.name) && isStr(x.text) && isTimestamp(x.at) && systemOk
}

export function isTableState(x: unknown): x is TableState {
  if (!isObj(x)) return false
  return (
    isStr(x.code) &&
    isStr(x.name) &&
    isStr(x.hostId) &&
    isStrArray(x.admins) &&
    isDeckId(x.deck) &&
    (x.avatarStyle == null || isAvatarStyleId(x.avatarStyle)) &&
    Array.isArray(x.participants) &&
    x.participants.every(isParticipant) &&
    isRound(x.round) &&
    Array.isArray(x.history) &&
    x.history.every(isHistoryEntry) &&
    Array.isArray(x.chat) &&
    x.chat.every(isChatMessage) &&
    isStrArray(x.kicked) &&
    typeof x.closed === 'boolean' &&
    isTimestamp(x.createdAt) &&
    isNum(x.version)
  )
}

export function isDomainEventList(x: unknown): x is DomainEvent[] {
  return Array.isArray(x) && x.every((e) => isObj(e) && isStr(e.type))
}
