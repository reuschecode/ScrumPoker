import { describe, expect, it } from 'vitest'
import {
  DECKS,
  allVoted,
  connectedParticipants,
  createTableState,
  currentDeck,
  getParticipant,
  getVote,
  hasVoted,
  isAdmin,
  isHost,
  pendingVoters,
  reduce,
  voteCount,
  votedIds,
  type Action,
  type TableState,
} from '@/domain'

const NOW = 1_700_000_000_000

function run(state: TableState, ...actions: Action[]): TableState {
  return actions.reduce((current, action) => {
    const result = reduce(current, action)
    if (result.error) throw new Error(result.error.message)
    return result.state
  }, state)
}

function table(): TableState {
  const base = createTableState({ code: 'ABC234', name: 'Mesa', host: { id: 'host', name: 'Ana' }, deck: 'powers', now: NOW })
  return run(
    base,
    { type: 'JOIN', user: { id: 'u1', name: 'Luis' }, at: NOW },
    { type: 'JOIN', user: { id: 'u2', name: 'Pedro' }, at: NOW },
    { type: 'GRANT_ADMIN', userId: 'u1', by: 'host', at: NOW },
  )
}

describe('selectores', () => {
  it('roles y participantes', () => {
    const s = table()
    expect(isHost(s, 'host')).toBe(true)
    expect(isHost(s, 'u1')).toBe(false)
    expect(isAdmin(s, 'host')).toBe(true)
    expect(isAdmin(s, 'u1')).toBe(true)
    expect(isAdmin(s, 'u2')).toBe(false)
    expect(getParticipant(s, 'u2')?.name).toBe('Pedro')
    expect(getParticipant(s, 'nadie')).toBeUndefined()
    expect(currentDeck(s)).toBe(DECKS.powers)
  })

  it('votos y progreso de la ronda', () => {
    const s = table()
    expect(voteCount(s)).toBe(0)
    expect(votedIds(s)).toEqual([])
    expect(pendingVoters(s).map((p) => p.id)).toEqual(['host', 'u1', 'u2'])
    expect(allVoted(s)).toBe(false)
    expect(getVote(s, 'u1')).toBeNull()
    expect(hasVoted(s, 'u1')).toBe(false)

    const partial = run(s, { type: 'VOTE', value: '4', by: 'u2', at: NOW }, { type: 'VOTE', value: '8', by: 'host', at: NOW })
    expect(voteCount(partial)).toBe(2)
    expect(votedIds(partial)).toEqual(['host', 'u2'])
    expect(pendingVoters(partial).map((p) => p.id)).toEqual(['u1'])
    expect(allVoted(partial)).toBe(false)
    expect(getVote(partial, 'u2')).toBe('4')
    expect(hasVoted(partial, 'u2')).toBe(true)

    const full = run(partial, { type: 'VOTE', value: '2', by: 'u1', at: NOW })
    expect(allVoted(full)).toBe(true)
    expect(pendingVoters(full)).toEqual([])
  })

  it('los desconectados no cuentan para el progreso', () => {
    const s = run(
      table(),
      { type: 'VOTE', value: '4', by: 'u2', at: NOW },
      { type: 'VOTE', value: '8', by: 'host', at: NOW },
      { type: 'DISCONNECT', userId: 'u1', at: NOW },
    )
    expect(connectedParticipants(s).map((p) => p.id)).toEqual(['host', 'u2'])
    expect(pendingVoters(s)).toEqual([])
    expect(allVoted(s)).toBe(true)
  })

  it('allVoted es false sin participantes conectados', () => {
    const s = table()
    const nobody: TableState = { ...s, participants: s.participants.map((p) => ({ ...p, connected: false })) }
    expect(allVoted(nobody)).toBe(false)
    expect(allVoted({ ...s, participants: [] })).toBe(false)
  })
})
