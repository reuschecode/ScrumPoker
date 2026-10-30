import type { RecentTable } from '@/store/types'

const KEY = 'sp:recent'
const MAX_RECENT = 8

function isRecentTable(x: unknown): x is RecentTable {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.code === 'string' &&
    typeof r.name === 'string' &&
    (r.role === 'host' || r.role === 'client') &&
    typeof r.at === 'number'
  )
}

function read(): RecentTable[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isRecentTable) : []
  } catch {
    return []
  }
}

function write(list: RecentTable[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Mesas visitadas, la más reciente primero. */
export function listRecentTables(): RecentTable[] {
  return read().sort((a, b) => b.at - a.at)
}

export function rememberTable(entry: Omit<RecentTable, 'at'> & { at?: number }): void {
  const others = read().filter((t) => t.code !== entry.code)
  const next: RecentTable = { code: entry.code, name: entry.name, role: entry.role, at: entry.at ?? Date.now() }
  write([next, ...others].slice(0, MAX_RECENT))
}

export function forgetTable(code: string): void {
  const list = read()
  const next = list.filter((t) => t.code !== code)
  if (next.length !== list.length) write(next)
}
