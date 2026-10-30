import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTableState } from '@/domain/table'
import { reduce } from '@/domain/reducer'
import { hostStorageKey, listHostTables, loadHostTable, saveHostTable } from '@/net/hostStorage'

const CODE = 'ABC234'
const HOST = 'host-1'

function validState() {
  return createTableState({ code: CODE, name: 'Mesa', host: { id: HOST, name: 'Ana' }, deck: 'fibonacci', now: 1 })
}

/** Una mesa con de todo: lo que la validación acepte debe incluir lo que la app guarda de verdad. */
function fullState() {
  let s = validState()
  const step = (action: Parameters<typeof reduce>[1]) => {
    s = reduce(s, action).state
  }
  step({ type: 'JOIN', user: { id: 'u1', name: 'Luis' }, at: 2 })
  step({ type: 'CHAT', text: 'hola', by: 'u1', at: 3 })
  step({ type: 'REACT', emoji: '👍', by: 'u1', at: 3 })
  step({ type: 'VOTE', value: '5', by: HOST, at: 4 })
  step({ type: 'VOTE', value: '8', by: 'u1', at: 4 })
  step({ type: 'REVEAL', by: HOST, at: 5 })
  step({ type: 'FINISH_ROUND', finalScore: '5', by: HOST, at: 6 })
  step({ type: 'VOTE', value: '3', by: 'u1', at: 7 })
  step({ type: 'REVEAL', by: HOST, at: 8 })
  step({ type: 'LEAVE', userId: 'u1', at: 9 })
  return s
}

describe('hostStorage', () => {
  beforeEach(() => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      get length() {
        return items.size
      },
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
      key: (i: number) => [...items.keys()][i] ?? null,
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const put = (state: unknown) =>
    localStorage.setItem(hostStorageKey(CODE), JSON.stringify({ state, secrets: {}, savedAt: 1 }))

  it('acepta lo que la propia app guarda, incluidos historial y votos de quien salió', () => {
    const state = fullState()
    expect(state.round.departedNames).toEqual({ u1: 'Luis' })
    expect(saveHostTable(CODE, { state, secrets: new Map([[HOST, 's']]) })).toBe(true)
    expect(loadHostTable(CODE)?.state).toEqual(state)
  })

  it('descarta estados incompletos o con forma incorrecta', () => {
    const good = validState()
    const bad: unknown[] = [
      { code: CODE, hostId: HOST, participants: [], round: {} },
      { code: CODE, hostId: HOST, participants: [], round: { votes: {} } },
      { ...good, admins: undefined },
      { ...good, kicked: 'x' },
      { ...good, chat: {} },
      { ...good, history: [{ roundId: 'r' }] },
      { ...good, deck: 'inventado' },
      { ...good, participants: [{ id: '__proto__', name: 'x', joinedAt: 1, connected: true }] },
      { ...good, round: { ...good.round, votes: { a: 5 } } },
      { ...good, round: { ...good.round, departedNames: { a: 1 } } },
    ]
    for (const state of bad) {
      put(state)
      expect(loadHostTable(CODE)).toBeNull()
    }
    expect(listHostTables()).toEqual([])
    put(good)
    expect(loadHostTable(CODE)?.state).toEqual(good)
  })
})
