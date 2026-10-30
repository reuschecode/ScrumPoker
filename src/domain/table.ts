import { LIMITS, type DeckId, type Round, type TableState, type UserId } from '@/domain/types'
import { isDeckId } from '@/domain/deck'

export interface CreateTableOptions {
  code: string
  name: string
  host: { id: UserId; name: string }
  deck: DeckId
  now: number
}

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Id de usuario aceptable. El patrón por sí solo deja pasar '__proto__' o 'constructor', que al
 * usarse como clave de un objeto (p. ej. `round.votes`) leerían del prototipo: se rechazan aparte.
 */
export function isValidUserId(value: unknown): value is UserId {
  return typeof value === 'string' && USER_ID_PATTERN.test(value) && !(value in Object.prototype)
}

/**
 * Controles y caracteres invisibles o de control bidireccional. Se conservan los espacios, y también
 * U+200C-U+200F y los selectores de variante y etiquetas, que hacen falta en emojis y algunos idiomas.
 */
const UNSAFE_CHARS =
  /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/g
/** Texto sin nada visible: lo que queda son espacios o unidores que solo tienen sentido junto a algo. */
const NOTHING_VISIBLE = /^[\s\u200C-\u200F\uFE00-\uFE0F\u{E0000}-\u{E007F}]*$/u

function stripUnsafe(raw: string): string {
  const clean = raw.replace(UNSAFE_CHARS, '')
  return NOTHING_VISIBLE.test(clean) ? '' : clean
}

/** Colapsa espacios, recorta y limita a `max` caracteres (misma regla que store/identity). */
export function sanitizeText(raw: string, max: number): string {
  return stripUnsafe(raw).replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Para texto que conserva sus saltos de línea (chat, puntaje): limpia y recorta, sin truncar. */
export function sanitizeFreeText(raw: string): string {
  return stripUnsafe(raw).trim()
}

export function sanitizeName(raw: string): string {
  return sanitizeText(raw, LIMITS.MAX_NAME)
}

export function sanitizeTableName(raw: string): string {
  return sanitizeText(raw, LIMITS.MAX_TABLE_NAME)
}

/** La historia solo se recorta; puede quedar vacía. */
export function sanitizeStory(raw: string): string {
  return sanitizeFreeText(raw).slice(0, LIMITS.MAX_STORY)
}

/** Ids deterministas: derivan de la versión del estado en la que se crean. */
export function roundId(version: number): string {
  return `r${version}`
}

export function messageId(version: number): string {
  return `m${version}`
}

export function newRound(opts: { id: string; number: number; story: string; startedAt: number }): Round {
  return {
    id: opts.id,
    number: opts.number,
    story: opts.story,
    votes: {},
    revealed: false,
    startedAt: opts.startedAt,
    revealedAt: null,
  }
}

export const DEFAULT_HOST_NAME = 'Anfitrión'

/** Estado inicial de una mesa recién creada: el host es el único participante y admin. */
export function createTableState(opts: CreateTableOptions): TableState {
  const name = sanitizeTableName(opts.name) || `Mesa ${opts.code}`
  const hostName = sanitizeName(opts.host.name) || DEFAULT_HOST_NAME
  return {
    code: opts.code,
    name,
    hostId: opts.host.id,
    admins: [opts.host.id],
    deck: isDeckId(opts.deck) ? opts.deck : 'fibonacci',
    participants: [{ id: opts.host.id, name: hostName, joinedAt: opts.now, connected: true }],
    round: newRound({ id: roundId(0), number: 1, story: '', startedAt: opts.now }),
    history: [],
    chat: [],
    kicked: [],
    closed: false,
    createdAt: opts.now,
    version: 0,
  }
}
