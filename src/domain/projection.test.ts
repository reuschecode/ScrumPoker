import { describe, expect, it } from 'vitest'
import {
  HIDDEN_VOTE,
  allVoted,
  createTableState,
  getVote,
  projectStateFor,
  reduce,
  votedIds,
  type Action,
  type TableState,
} from '@/domain'

const NOW = 1_700_000_000_000

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function run(state: TableState, ...actions: Action[]): TableState {
  return actions.reduce((current, action) => {
    const result = reduce(current, action)
    if (result.error) throw new Error(result.error.message)
    return result.state
  }, state)
}

function votedTable(): TableState {
  const base = createTableState({ code: 'ABC234', name: 'Mesa', host: { id: 'host', name: 'Ana' }, deck: 'fibonacci', now: NOW })
  return run(
    base,
    { type: 'JOIN', user: { id: 'u1', name: 'Luis' }, at: NOW },
    { type: 'JOIN', user: { id: 'u2', name: 'Pedro' }, at: NOW },
    { type: 'VOTE', value: '5', by: 'host', at: NOW },
    { type: 'VOTE', value: '8', by: 'u1', at: NOW },
  )
}

describe('projectStateFor', () => {
  it('oculta los votos ajenos y conserva el propio', () => {
    const state = deepFreeze(votedTable())
    const projected = projectStateFor(state, 'u1')
    expect(projected).not.toBe(state)
    expect(projected.round.votes).toEqual({ host: HIDDEN_VOTE, u1: '8' })
    expect(projected.round.revealed).toBe(false)
    // Lo demás se comparte por identidad.
    expect(projected.participants).toBe(state.participants)
    expect(projected.history).toBe(state.history)
    expect(projected.chat).toBe(state.chat)
    expect(projected.admins).toBe(state.admins)
    expect(projected.round.id).toBe(state.round.id)
    expect(projected.version).toBe(state.version)
    // La entrada no cambia.
    expect(state.round.votes).toEqual({ host: '5', u1: '8' })
  })

  it('un espectador sin voto ve todos ocultos', () => {
    const projected = projectStateFor(votedTable(), 'u2')
    expect(projected.round.votes).toEqual({ host: HIDDEN_VOTE, u1: HIDDEN_VOTE })
    expect(getVote(projected, 'u2')).toBeNull()
    expect(getVote(projected, 'host')).toBe(HIDDEN_VOTE)
  })

  it('el host también recibe una proyección', () => {
    expect(projectStateFor(votedTable(), 'host').round.votes).toEqual({ host: '5', u1: HIDDEN_VOTE })
  })

  it('tras revelar devuelve el mismo objeto', () => {
    const revealed = run(votedTable(), { type: 'REVEAL', by: 'host', at: NOW })
    expect(projectStateFor(revealed, 'u2')).toBe(revealed)
    expect(projectStateFor(revealed, 'u2').round.votes).toEqual({ host: '5', u1: '8' })
  })

  it('sin votos devuelve el mismo objeto', () => {
    const empty = createTableState({ code: 'ABC234', name: 'Mesa', host: { id: 'host', name: 'Ana' }, deck: 'tshirt', now: NOW })
    expect(projectStateFor(empty, 'u9')).toBe(empty)
  })

  it('la proyección sigue sirviendo a los selectores de progreso', () => {
    const projected = projectStateFor(votedTable(), 'u2')
    expect(votedIds(projected)).toEqual(['host', 'u1'])
    expect(allVoted(projected)).toBe(false)
    const everyone = run(votedTable(), { type: 'VOTE', value: '3', by: 'u2', at: NOW })
    expect(allVoted(projectStateFor(everyone, 'u1'))).toBe(true)
  })
})
