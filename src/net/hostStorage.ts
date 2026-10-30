/**
 * Persistencia del host en localStorage (`sp:host:<CODE>`) para sobrevivir a un refresh.
 * Toda lectura/escritura es tolerante: sin almacenamiento o con datos corruptos devuelve null/[]
 * en vez de lanzar.
 */
import type { TableState, UserId } from '@/domain/types'
import { isTableState } from '@/domain/validate'

export const HOST_STORAGE_PREFIX = 'sp:host:'

export interface StoredHostTable {
  state: TableState
  secrets: Record<UserId, string>
  savedAt: number
}

export function hostStorageKey(code: string): string {
  return `${HOST_STORAGE_PREFIX}${code}`
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isStringRecord(x: unknown): x is Record<string, string> {
  return (
    !!x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((v) => typeof v === 'string')
  )
}

function parseStored(raw: string | null): StoredHostTable | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { state, secrets, savedAt } = parsed as Partial<StoredHostTable>
    if (!isTableState(state)) return null
    return {
      state,
      secrets: isStringRecord(secrets) ? secrets : {},
      savedAt: typeof savedAt === 'number' ? savedAt : 0,
    }
  } catch {
    return null
  }
}

export function saveHostTable(
  code: string,
  data: { state: TableState; secrets: Record<UserId, string> | Map<UserId, string> },
): boolean {
  const s = storage()
  if (!s) return false
  try {
    const secrets = data.secrets instanceof Map ? Object.fromEntries(data.secrets) : data.secrets
    const payload: StoredHostTable = { state: data.state, secrets, savedAt: Date.now() }
    s.setItem(hostStorageKey(code), JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export function loadHostTable(code: string): StoredHostTable | null {
  const s = storage()
  if (!s) return null
  try {
    return parseStored(s.getItem(hostStorageKey(code)))
  } catch {
    return null
  }
}

export function removeHostTable(code: string): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(hostStorageKey(code))
  } catch {
    /* ignorar */
  }
}

/** Mesas hosteadas desde este navegador, la guardada más recientemente primero. */
export function listHostTables(): Array<StoredHostTable & { code: string }> {
  const s = storage()
  if (!s) return []
  const out: Array<StoredHostTable & { code: string }> = []
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (!key || !key.startsWith(HOST_STORAGE_PREFIX)) continue
      const parsed = parseStored(s.getItem(key))
      if (parsed) out.push({ code: key.slice(HOST_STORAGE_PREFIX.length), ...parsed })
    }
  } catch {
    /* ignorar */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}
