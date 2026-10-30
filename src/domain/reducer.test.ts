import { DEFAULT_AVATAR_STYLE } from '@/domain/avatars'
import { describe, expect, it } from 'vitest'
import {
  DECKS,
  DOMAIN_ERROR_MESSAGES,
  LIMITS,
  REACTION_EMOJIS,
  computeStats,
  createTableState,
  domainError,
  reduce,
  type Action,
  type ChatMessage,
  type Command,
  type DomainErrorCode,
  type HistoryEntry,
  type TableState,
  type UserId,
} from '@/domain'

const NOW = 1_700_000_000_000
const HOST = 'host'
const U1 = 'u1'
const U2 = 'u2'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

/** Aplica una acción sobre el estado congelado y verifica los invariantes del contrato. */
function step(state: TableState, action: Action) {
  const frozen = deepFreeze(state)
  const result = reduce(frozen, action)
  if (result.error) {
    expect(result.state).toBe(frozen)
    expect(result.events).toEqual([])
    expect(result.error.message.length).toBeGreaterThan(0)
  } else if (result.state === frozen) {
    expect(result.events).toEqual([])
  } else {
    expect(result.state.version).toBe(frozen.version + 1)
    expect(result.events.length).toBeGreaterThan(0)
  }
  return result
}

function ok(state: TableState, action: Action): TableState {
  const result = step(state, action)
  expect(result.error).toBeUndefined()
  expect(result.state).not.toBe(state)
  return result.state
}

function okWithEvents(state: TableState, action: Action) {
  const result = step(state, action)
  expect(result.error).toBeUndefined()
  expect(result.state).not.toBe(state)
  return result
}

function fails(state: TableState, action: Action, code: DomainErrorCode) {
  const result = step(state, action)
  expect(result.error?.code).toBe(code)
  return result
}

function isNoop(state: TableState, action: Action) {
  const result = step(state, action)
  expect(result.error).toBeUndefined()
  expect(result.state).toBe(state)
  expect(result.events).toEqual([])
}

const user = (cmd: Command, by: UserId, at = NOW): Action => ({ ...cmd, by, at })
const join = (id: UserId, name: string, at = NOW): Action => ({ type: 'JOIN', user: { id, name }, at })

function baseTable(): TableState {
  return createTableState({
    code: 'ABC234',
    name: 'Sprint 12',
    host: { id: HOST, name: 'Ana' },
    deck: 'fibonacci',
    now: NOW,
  })
}

/** Mesa con el host (Ana) y dos participantes: u1 (Luis) y u2 (Pedro). */
function table(): TableState {
  let s = baseTable()
  s = ok(s, join(U1, 'Luis', NOW + 1))
  s = ok(s, join(U2, 'Pedro', NOW + 2))
  return s
}

function revealedTable(): TableState {
  let s = table()
  s = ok(s, user({ type: 'SET_STORY', story: 'HU-1 Login' }, HOST))
  s = ok(s, user({ type: 'VOTE', value: '5' }, HOST))
  s = ok(s, user({ type: 'VOTE', value: '5' }, U1))
  s = ok(s, user({ type: 'VOTE', value: '8' }, U2))
  s = ok(s, user({ type: 'REVEAL' }, HOST, NOW + 10))
  return s
}

function historyEntry(n: number): HistoryEntry {
  return {
    roundId: `old${n}`,
    number: n,
    story: `HU-${n}`,
    finalScore: '3',
    votes: [],
    stats: computeStats({}, DECKS.fibonacci),
    finishedAt: NOW,
    finishedBy: HOST,
  }
}

function chatMessage(n: number): ChatMessage {
  return { id: `old${n}`, userId: HOST, name: 'Ana', text: `msg ${n}`, at: NOW }
}

const ALL_ACTIONS: Action[] = [
  join('u9', 'Nuevo'),
  { type: 'DISCONNECT', userId: U1, at: NOW },
  { type: 'LEAVE', userId: U1, at: NOW },
  user({ type: 'SET_NAME', name: 'X' }, U1),
  user({ type: 'SET_TABLE_NAME', name: 'X' }, HOST),
  user({ type: 'SET_DECK', deck: 'tshirt' }, HOST),
  user({ type: 'SET_STORY', story: 'X' }, HOST),
  user({ type: 'VOTE', value: '5' }, U1),
  user({ type: 'CLEAR_VOTE' }, U1),
  user({ type: 'REVEAL' }, HOST),
  user({ type: 'RESET_ROUND' }, HOST),
  user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST),
  user({ type: 'KICK', userId: U1 }, HOST),
  user({ type: 'GRANT_ADMIN', userId: U1 }, HOST),
  user({ type: 'REVOKE_ADMIN', userId: U1 }, HOST),
  user({ type: 'CHAT', text: 'hola' }, U1),
  user({ type: 'REACT', emoji: '👍' }, U1),
  user({ type: 'CLOSE_TABLE' }, HOST),
]

describe('createTableState', () => {
  it('crea la mesa con el host como único participante y admin', () => {
    const s = baseTable()
    expect(s.code).toBe('ABC234')
    expect(s.name).toBe('Sprint 12')
    expect(s.hostId).toBe(HOST)
    expect(s.admins).toEqual([HOST])
    expect(s.deck).toBe('fibonacci')
    expect(s.participants).toEqual([{ id: HOST, name: 'Ana', joinedAt: NOW, connected: true }])
    expect(s.round).toEqual({
      id: 'r0',
      number: 1,
      story: '',
      votes: {},
      revealed: false,
      startedAt: NOW,
      revealedAt: null,
    })
    expect(s.history).toEqual([])
    expect(s.chat).toEqual([])
    expect(s.kicked).toEqual([])
    expect(s.closed).toBe(false)
    expect(s.createdAt).toBe(NOW)
    expect(s.version).toBe(0)
  })

  it('sanea nombres y aplica valores por defecto', () => {
    const s = createTableState({
      code: 'XYZ789',
      name: '   ',
      host: { id: HOST, name: '  ana   maría  ' },
      deck: 'nope' as never,
      now: NOW,
    })
    expect(s.name).toBe('Mesa XYZ789')
    expect(s.participants[0].name).toBe('ana maría')
    expect(s.deck).toBe('fibonacci')
    const long = createTableState({
      code: 'XYZ789',
      name: 'n'.repeat(100),
      host: { id: HOST, name: 'a'.repeat(100) },
      deck: 'tshirt',
      now: NOW,
    })
    expect(long.name).toHaveLength(LIMITS.MAX_TABLE_NAME)
    expect(long.participants[0].name).toHaveLength(LIMITS.MAX_NAME)
    expect(long.deck).toBe('tshirt')
  })
})

describe('errores de dominio', () => {
  it('tiene un mensaje en español para cada código', () => {
    for (const message of Object.values(DOMAIN_ERROR_MESSAGES)) expect(message.length).toBeGreaterThan(0)
    expect(domainError('not-admin')).toEqual({ code: 'not-admin', message: DOMAIN_ERROR_MESSAGES['not-admin'] })
    expect(domainError('not-admin', 'Personalizado').message).toBe('Personalizado')
  })
})

describe('mesa cerrada', () => {
  it('CLOSE_TABLE solo lo puede hacer el host', () => {
    const s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    fails(s, user({ type: 'CLOSE_TABLE' }, U1), 'not-host')
    fails(s, user({ type: 'CLOSE_TABLE' }, U2), 'not-host')
    const { state, events } = okWithEvents(s, user({ type: 'CLOSE_TABLE' }, HOST))
    expect(state.closed).toBe(true)
    expect(events).toEqual([{ type: 'table.closed', by: HOST }])
  })

  it('rechaza cualquier acción con table-closed', () => {
    const closed = ok(table(), user({ type: 'CLOSE_TABLE' }, HOST))
    for (const action of ALL_ACTIONS) fails(closed, action, 'table-closed')
  })
})

describe('JOIN', () => {
  it('agrega un participante nuevo y emite participant.joined', () => {
    const s = baseTable()
    const { state, events } = okWithEvents(s, join(U1, '  Luis   Pérez ', NOW + 5))
    expect(state.participants).toHaveLength(2)
    expect(state.participants[1]).toEqual({ id: U1, name: 'Luis Pérez', joinedAt: NOW + 5, connected: true })
    expect(state.admins).toEqual([HOST])
    expect(events).toEqual([{ type: 'participant.joined', userId: U1, name: 'Luis Pérez' }])
    expect(state.version).toBe(1)
  })

  it('rechaza nombre vacío e ids inválidos', () => {
    fails(baseTable(), join(U1, '   '), 'invalid-name')
    fails(baseTable(), join('', 'Luis'), 'invalid-text')
    fails(baseTable(), { type: 'JOIN', user: undefined as never, at: NOW }, 'invalid-text')
  })

  it('recorta el nombre a MAX_NAME', () => {
    const s = ok(baseTable(), join(U1, 'x'.repeat(50)))
    expect(s.participants[1].name).toHaveLength(LIMITS.MAX_NAME)
  })

  it('rechaza cuando la mesa está llena', () => {
    let s = baseTable()
    for (let i = 1; i < LIMITS.MAX_PARTICIPANTS; i++) s = ok(s, join(`p${i}`, `P ${i}`))
    expect(s.participants).toHaveLength(LIMITS.MAX_PARTICIPANTS)
    fails(s, join('extra', 'Extra'), 'table-full')
    // Un participante existente sí puede reconectarse aunque la mesa esté llena.
    const away = ok(s, { type: 'DISCONNECT', userId: 'p1', at: NOW })
    ok(away, join('p1', 'P 1'))
  })

  it('rechaza a un usuario expulsado', () => {
    const s = ok(table(), user({ type: 'KICK', userId: U1 }, HOST))
    fails(s, join(U1, 'Luis'), 'kicked')
    fails(s, join(U1, 'Otro nombre'), 'kicked')
  })

  it('es noop si ya está conectado con el mismo nombre', () => {
    isNoop(table(), join(U1, 'Luis'))
    isNoop(table(), join(U1, '  Luis  '))
  })

  it('reconecta a un participante desconectado conservando voto y rol', () => {
    let s = table()
    s = ok(s, user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    s = ok(s, user({ type: 'VOTE', value: '3' }, U1))
    s = ok(s, { type: 'DISCONNECT', userId: U1, at: NOW })
    expect(s.participants[1].connected).toBe(false)
    const { state, events } = okWithEvents(s, join(U1, 'Luis'))
    expect(state.participants[1]).toMatchObject({ id: U1, name: 'Luis', connected: true, joinedAt: NOW + 1 })
    expect(state.round.votes[U1]).toBe('3')
    expect(state.admins).toContain(U1)
    expect(events).toEqual([{ type: 'participant.reconnected', userId: U1 }])
  })

  it('renombra al reconectar si el nombre cambió', () => {
    const away = ok(table(), { type: 'DISCONNECT', userId: U1, at: NOW })
    const { state, events } = okWithEvents(away, join(U1, 'Luis M.'))
    expect(state.participants[1].name).toBe('Luis M.')
    expect(events).toEqual([
      { type: 'participant.renamed', userId: U1, name: 'Luis M.', previous: 'Luis' },
      { type: 'participant.reconnected', userId: U1 },
    ])
  })

  it('renombra a un participante conectado sin emitir reconexión', () => {
    const { state, events } = okWithEvents(table(), join(U1, 'Lucho'))
    expect(state.participants[1].name).toBe('Lucho')
    expect(events).toEqual([{ type: 'participant.renamed', userId: U1, name: 'Lucho', previous: 'Luis' }])
  })

  it('al reconectar con nombre vacío conserva el nombre anterior', () => {
    const away = ok(table(), { type: 'DISCONNECT', userId: U1, at: NOW })
    const { state, events } = okWithEvents(away, join(U1, '   '))
    expect(state.participants[1].name).toBe('Luis')
    expect(events).toEqual([{ type: 'participant.reconnected', userId: U1 }])
  })

  it('rechaza ids peligrosos o fuera del formato', () => {
    for (const id of ['__proto__', 'constructor', 'toString', 'con espacio', 'a.b', 'x'.repeat(65), '']) {
      fails(table(), join(id, 'Evil'), 'invalid-text')
    }
    ok(table(), join('Abc_12-z', 'Bien'))
  })
})

describe('DISCONNECT', () => {
  it('marca connected=false y emite participant.disconnected', () => {
    const { state, events } = okWithEvents(table(), { type: 'DISCONNECT', userId: U1, at: NOW })
    expect(state.participants[1].connected).toBe(false)
    expect(state.participants[1].id).toBe(U1)
    expect(events).toEqual([{ type: 'participant.disconnected', userId: U1 }])
  })

  it('rechaza al host y es noop para desconocidos o ya desconectados', () => {
    fails(table(), { type: 'DISCONNECT', userId: HOST, at: NOW }, 'cannot-target-host')
    isNoop(table(), { type: 'DISCONNECT', userId: 'nadie', at: NOW })
    const away = ok(table(), { type: 'DISCONNECT', userId: U1, at: NOW })
    isNoop(away, { type: 'DISCONNECT', userId: U1, at: NOW })
  })
})

describe('SET_AVATAR_STYLE', () => {
  it('un admin cambia el estilo y se emite el evento', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'SET_AVATAR_STYLE', style: 'pixel-art' }, HOST))
    expect(state.avatarStyle).toBe('pixel-art')
    expect(events).toEqual([{ type: 'avatarStyle.changed', style: 'pixel-art', by: HOST }])
  })

  it('rechaza a quien no es admin y los estilos desconocidos', () => {
    fails(table(), user({ type: 'SET_AVATAR_STYLE', style: 'pixel-art' }, U1), 'not-admin')
    const unknownStyle = { type: 'SET_AVATAR_STYLE', style: 'nope' } as unknown as Command
    fails(table(), user(unknownStyle, HOST), 'invalid-avatar-style')
  })

  it('elegir el estilo actual no cambia nada, también en mesas guardadas sin estilo', () => {
    isNoop(table(), user({ type: 'SET_AVATAR_STYLE', style: DEFAULT_AVATAR_STYLE }, HOST))
    const legacy = { ...table(), avatarStyle: undefined }
    isNoop(legacy, user({ type: 'SET_AVATAR_STYLE', style: DEFAULT_AVATAR_STYLE }, HOST))
  })
})

describe('LEAVE', () => {
  it('conserva el rol de admin para cuando el usuario vuelva', () => {
    let s = table()
    s = reduce(s, { type: 'JOIN', user: { id: 'vuelve', name: 'Vuelve' }, at: NOW }).state
    s = reduce(s, { type: 'GRANT_ADMIN', userId: 'vuelve', by: HOST, at: NOW }).state
    s = reduce(s, { type: 'LEAVE', userId: 'vuelve', at: NOW }).state
    s = reduce(s, { type: 'JOIN', user: { id: 'vuelve', name: 'Vuelve' }, at: NOW }).state
    expect(s.admins).toContain('vuelve')
  })

  it('retira al participante con su voto', () => {
    let s = table()
    s = ok(s, user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    s = ok(s, user({ type: 'VOTE', value: '8' }, U1))
    s = ok(s, user({ type: 'VOTE', value: '3' }, U2))
    const { state, events } = okWithEvents(s, { type: 'LEAVE', userId: U1, at: NOW })
    expect(state.participants.map((p) => p.id)).toEqual([HOST, U2])
    expect(state.round.votes).toEqual({ [U2]: '3' })
    expect(state.kicked).toEqual([])
    expect(events).toEqual([{ type: 'participant.left', userId: U1, name: 'Luis' }])
    // Puede volver a entrar.
    ok(state, join(U1, 'Luis'))
  })

  it('rechaza al host y es noop para desconocidos', () => {
    fails(table(), { type: 'LEAVE', userId: HOST, at: NOW }, 'cannot-target-host')
    isNoop(table(), { type: 'LEAVE', userId: 'nadie', at: NOW })
  })
})

describe('autoría', () => {
  it('rechaza acciones de quien no es participante', () => {
    fails(table(), user({ type: 'VOTE', value: '5' }, 'intruso'), 'not-participant')
    fails(table(), user({ type: 'CHAT', text: 'hola' }, 'intruso'), 'not-participant')
    fails(table(), user({ type: 'CLOSE_TABLE' }, 'intruso'), 'not-participant')
  })

  it('exige admin donde corresponde', () => {
    const s = table()
    fails(s, user({ type: 'SET_TABLE_NAME', name: 'X' }, U1), 'not-admin')
    fails(s, user({ type: 'SET_DECK', deck: 'tshirt' }, U1), 'not-admin')
    fails(s, user({ type: 'SET_STORY', story: 'X' }, U1), 'not-admin')
    fails(s, user({ type: 'REVEAL' }, U1), 'not-admin')
    fails(s, user({ type: 'RESET_ROUND' }, U1), 'not-admin')
    fails(s, user({ type: 'FINISH_ROUND', finalScore: '5' }, U1), 'not-admin')
    fails(s, user({ type: 'KICK', userId: U2 }, U1), 'not-admin')
    fails(s, user({ type: 'GRANT_ADMIN', userId: U2 }, U1), 'not-admin')
    fails(s, user({ type: 'REVOKE_ADMIN', userId: HOST }, U1), 'not-admin')
    const reveal = fails(s, user({ type: 'REVEAL' }, U1), 'not-admin')
    expect(reveal.error?.message).toBe('Solo un admin puede revelar los votos')
  })
})

describe('SET_NAME', () => {
  it('renombra y emite participant.renamed con el nombre anterior', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'SET_NAME', name: '  Luis   Alberto ' }, U1))
    expect(state.participants[1].name).toBe('Luis Alberto')
    expect(events).toEqual([{ type: 'participant.renamed', userId: U1, name: 'Luis Alberto', previous: 'Luis' }])
  })

  it('rechaza vacío, recorta a MAX_NAME y es noop si no cambia', () => {
    fails(table(), user({ type: 'SET_NAME', name: '   ' }, U1), 'invalid-name')
    fails(table(), user({ type: 'SET_NAME', name: null as never }, U1), 'invalid-name')
    const s = ok(table(), user({ type: 'SET_NAME', name: 'a'.repeat(60) }, U1))
    expect(s.participants[1].name).toHaveLength(LIMITS.MAX_NAME)
    isNoop(table(), user({ type: 'SET_NAME', name: 'Luis' }, U1))
    isNoop(table(), user({ type: 'SET_NAME', name: ' Luis ' }, U1))
  })
})

describe('SET_TABLE_NAME', () => {
  it('renombra la mesa (admin) y emite table.renamed', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'SET_TABLE_NAME', name: ' Sprint  13 ' }, HOST))
    expect(state.name).toBe('Sprint 13')
    expect(events).toEqual([{ type: 'table.renamed', name: 'Sprint 13', by: HOST }])
  })

  it('rechaza vacío, recorta a MAX_TABLE_NAME y es noop si no cambia', () => {
    fails(table(), user({ type: 'SET_TABLE_NAME', name: '' }, HOST), 'invalid-name')
    const s = ok(table(), user({ type: 'SET_TABLE_NAME', name: 'n'.repeat(80) }, HOST))
    expect(s.name).toHaveLength(LIMITS.MAX_TABLE_NAME)
    isNoop(table(), user({ type: 'SET_TABLE_NAME', name: 'Sprint 12' }, HOST))
  })

  it('lo puede hacer un admin que no es host', () => {
    const s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    ok(s, user({ type: 'SET_TABLE_NAME', name: 'Otra' }, U1))
  })
})

describe('SET_DECK', () => {
  it('cambia el mazo y emite deck.changed', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'SET_DECK', deck: 'tshirt' }, HOST))
    expect(state.deck).toBe('tshirt')
    expect(events).toEqual([{ type: 'deck.changed', deck: 'tshirt', by: HOST }])
    // Las cartas válidas ahora son tallas.
    fails(state, user({ type: 'VOTE', value: '5' }, U1), 'invalid-card')
    ok(state, user({ type: 'VOTE', value: 'M' }, U1))
  })

  it('rechaza mazos inválidos, es noop si es el mismo y bloquea con votos en curso', () => {
    fails(table(), user({ type: 'SET_DECK', deck: 'nope' as never }, HOST), 'invalid-deck')
    isNoop(table(), user({ type: 'SET_DECK', deck: 'fibonacci' }, HOST))
    const voted = ok(table(), user({ type: 'VOTE', value: '5' }, U1))
    fails(voted, user({ type: 'SET_DECK', deck: 'powers' }, HOST), 'votes-in-progress')
    // El mismo mazo sigue siendo noop aunque haya votos.
    isNoop(voted, user({ type: 'SET_DECK', deck: 'fibonacci' }, HOST))
    // Tras reiniciar la ronda ya se puede cambiar.
    const reset = ok(voted, user({ type: 'RESET_ROUND' }, HOST))
    ok(reset, user({ type: 'SET_DECK', deck: 'powers' }, HOST))
  })
})

describe('SET_STORY', () => {
  it('cambia la historia y emite story.changed', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'SET_STORY', story: '  HU-42 Pagos  ' }, HOST))
    expect(state.round.story).toBe('HU-42 Pagos')
    expect(events).toEqual([{ type: 'story.changed', story: 'HU-42 Pagos', by: HOST }])
    expect(state.round.id).toBe(table().round.id)
  })

  it('permite vacío, recorta a MAX_STORY, es noop si no cambia y funciona revelada', () => {
    isNoop(table(), user({ type: 'SET_STORY', story: '' }, HOST))
    const s = ok(table(), user({ type: 'SET_STORY', story: 'HU' }, HOST))
    const cleared = ok(s, user({ type: 'SET_STORY', story: '   ' }, HOST))
    expect(cleared.round.story).toBe('')
    const long = ok(s, user({ type: 'SET_STORY', story: 's'.repeat(300) }, HOST))
    expect(long.round.story).toHaveLength(LIMITS.MAX_STORY)
    isNoop(s, user({ type: 'SET_STORY', story: ' HU ' }, HOST))
    const revealed = revealedTable()
    const changed = ok(revealed, user({ type: 'SET_STORY', story: 'HU-1 Login (ajustada)' }, HOST))
    expect(changed.round.revealed).toBe(true)
    expect(changed.round.votes).toEqual(revealed.round.votes)
  })
})

describe('VOTE y CLEAR_VOTE', () => {
  it('registra el voto y emite vote.cast con changed', () => {
    const first = okWithEvents(table(), user({ type: 'VOTE', value: '5' }, U1))
    expect(first.state.round.votes).toEqual({ [U1]: '5' })
    expect(first.events).toEqual([{ type: 'vote.cast', userId: U1, changed: false }])
    const second = okWithEvents(first.state, user({ type: 'VOTE', value: '8' }, U1))
    expect(second.state.round.votes).toEqual({ [U1]: '8' })
    expect(second.events).toEqual([{ type: 'vote.cast', userId: U1, changed: true }])
    // Los no admins y las cartas especiales también cuentan.
    const coffee = ok(second.state, user({ type: 'VOTE', value: '☕' }, U2))
    expect(coffee.round.votes).toEqual({ [U1]: '8', [U2]: '☕' })
  })

  it('rechaza cartas fuera del mazo y es noop si repite el valor', () => {
    fails(table(), user({ type: 'VOTE', value: '4' }, U1), 'invalid-card')
    fails(table(), user({ type: 'VOTE', value: 'M' }, U1), 'invalid-card')
    fails(table(), user({ type: 'VOTE', value: '' }, U1), 'invalid-card')
    fails(table(), user({ type: 'VOTE', value: 5 as never }, U1), 'invalid-card')
    const voted = ok(table(), user({ type: 'VOTE', value: '5' }, U1))
    isNoop(voted, user({ type: 'VOTE', value: '5' }, U1))
  })

  it('no permite votar ni borrar tras revelar', () => {
    const s = revealedTable()
    fails(s, user({ type: 'VOTE', value: '3' }, U1), 'already-revealed')
    fails(s, user({ type: 'CLEAR_VOTE' }, U1), 'already-revealed')
  })

  it('CLEAR_VOTE borra el voto y es noop sin voto', () => {
    isNoop(table(), user({ type: 'CLEAR_VOTE' }, U1))
    const voted = ok(ok(table(), user({ type: 'VOTE', value: '5' }, U1)), user({ type: 'VOTE', value: '3' }, U2))
    const { state, events } = okWithEvents(voted, user({ type: 'CLEAR_VOTE' }, U1))
    expect(state.round.votes).toEqual({ [U2]: '3' })
    expect(events).toEqual([{ type: 'vote.cleared', userId: U1 }])
  })

  it('comparte estructura en las rutas que no cambian', () => {
    const s = table()
    const next = ok(s, user({ type: 'VOTE', value: '5' }, U1))
    expect(next.participants).toBe(s.participants)
    expect(next.history).toBe(s.history)
    expect(next.chat).toBe(s.chat)
    expect(next.admins).toBe(s.admins)
    expect(next.kicked).toBe(s.kicked)
    expect(next.round).not.toBe(s.round)
    expect(s.round.votes).toEqual({})
  })
})

describe('REVEAL', () => {
  it('revela, estampa revealedAt y emite round.revealed con stats', () => {
    let s = table()
    s = ok(s, user({ type: 'VOTE', value: '5' }, U1))
    s = ok(s, user({ type: 'VOTE', value: '5' }, U2))
    const { state, events } = okWithEvents(s, user({ type: 'REVEAL' }, HOST, NOW + 99))
    expect(state.round.revealed).toBe(true)
    expect(state.round.revealedAt).toBe(NOW + 99)
    expect(state.round.votes).toEqual({ [U1]: '5', [U2]: '5' })
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.type).toBe('round.revealed')
    if (event.type === 'round.revealed') {
      expect(event.by).toBe(HOST)
      expect(event.roundId).toBe(state.round.id)
      expect(event.stats.count).toBe(2)
      expect(event.stats.consensus).toBe(true)
      expect(event.stats.suggested).toBe('5')
    }
  })

  it('rechaza sin votos y si ya está revelada', () => {
    fails(table(), user({ type: 'REVEAL' }, HOST), 'no-votes')
    fails(revealedTable(), user({ type: 'REVEAL' }, HOST), 'already-revealed')
  })

  it('un admin delegado puede revelar', () => {
    let s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    s = ok(s, user({ type: 'VOTE', value: '3' }, U2))
    ok(s, user({ type: 'REVEAL' }, U1))
  })
})

describe('RESET_ROUND', () => {
  it('es noop si la ronda está limpia', () => {
    isNoop(table(), user({ type: 'RESET_ROUND' }, HOST))
  })

  it('borra votos conservando número e historia, con nuevo id', () => {
    let s = ok(table(), user({ type: 'SET_STORY', story: 'HU-7' }, HOST))
    s = ok(s, user({ type: 'VOTE', value: '5' }, U1))
    const { state, events } = okWithEvents(s, user({ type: 'RESET_ROUND' }, HOST, NOW + 50))
    expect(state.round).toEqual({
      id: `r${state.version}`,
      number: 1,
      story: 'HU-7',
      votes: {},
      revealed: false,
      startedAt: NOW + 50,
      revealedAt: null,
    })
    expect(state.round.id).not.toBe(s.round.id)
    expect(state.history).toEqual([])
    expect(events).toEqual([{ type: 'round.reset', by: HOST }])
  })

  it('vuelve a ocultar una ronda revelada sin guardar historial', () => {
    const s = revealedTable()
    const state = ok(s, user({ type: 'RESET_ROUND' }, HOST))
    expect(state.round.revealed).toBe(false)
    expect(state.round.revealedAt).toBeNull()
    expect(state.round.votes).toEqual({})
    expect(state.round.number).toBe(1)
    expect(state.round.story).toBe('HU-1 Login')
    expect(state.history).toEqual([])
    ok(state, user({ type: 'VOTE', value: '2' }, U1))
  })
})

describe('FINISH_ROUND', () => {
  it('rechaza si no está revelada o el puntaje no es válido', () => {
    const voted = ok(table(), user({ type: 'VOTE', value: '5' }, U1))
    fails(voted, user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST), 'not-revealed')
    const s = revealedTable()
    fails(s, user({ type: 'FINISH_ROUND', finalScore: '   ' }, HOST), 'invalid-text')
    fails(s, user({ type: 'FINISH_ROUND', finalScore: 'x'.repeat(LIMITS.MAX_FINAL_SCORE + 1) }, HOST), 'invalid-text')
    fails(s, user({ type: 'FINISH_ROUND', finalScore: undefined as never }, HOST), 'invalid-text')
    ok(s, user({ type: 'FINISH_ROUND', finalScore: 'x'.repeat(LIMITS.MAX_FINAL_SCORE) }, HOST))
  })

  it('guarda el historial y abre la siguiente ronda', () => {
    const s = revealedTable()
    const { state, events } = okWithEvents(
      s,
      user({ type: 'FINISH_ROUND', finalScore: ' 8 ', nextStory: '  HU-2 Registro  ' }, HOST, NOW + 20),
    )
    expect(state.history).toHaveLength(1)
    const entry = state.history[0]
    expect(entry).toEqual({
      roundId: s.round.id,
      number: 1,
      story: 'HU-1 Login',
      finalScore: '8',
      votes: [
        { userId: HOST, name: 'Ana', value: '5' },
        { userId: U1, name: 'Luis', value: '5' },
        { userId: U2, name: 'Pedro', value: '8' },
      ],
      stats: computeStats(s.round.votes, DECKS.fibonacci),
      finishedAt: NOW + 20,
      finishedBy: HOST,
    })
    expect(entry.stats.suggested).toBe('5')
    expect(state.round).toEqual({
      id: `r${state.version}`,
      number: 2,
      story: 'HU-2 Registro',
      votes: {},
      revealed: false,
      startedAt: NOW + 20,
      revealedAt: null,
    })
    expect(events).toEqual([{ type: 'round.finished', by: HOST, entry }])
  })

  it('sin nextStory la nueva ronda queda sin historia y recorta una larga', () => {
    const s = revealedTable()
    expect(ok(s, user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST)).round.story).toBe('')
    const long = ok(s, user({ type: 'FINISH_ROUND', finalScore: '5', nextStory: 'z'.repeat(500) }, HOST))
    expect(long.round.story).toHaveLength(LIMITS.MAX_STORY)
  })

  it('usa "Participante" para votos de usuarios que ya no están', () => {
    const s = revealedTable()
    const ghost: TableState = { ...s, round: { ...s.round, votes: { ...s.round.votes, fantasma: '13' } } }
    const state = ok(ghost, user({ type: 'FINISH_ROUND', finalScore: '8' }, HOST))
    expect(state.history[0].votes.at(-1)).toEqual({ userId: 'fantasma', name: 'Participante', value: '13' })
    expect(state.history[0].stats.count).toBe(4)
  })

  it('recorta el historial a MAX_HISTORY descartando los más antiguos', () => {
    const s = revealedTable()
    const full: TableState = {
      ...s,
      history: Array.from({ length: LIMITS.MAX_HISTORY }, (_, i) => historyEntry(i + 1)),
    }
    const state = ok(full, user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST))
    expect(state.history).toHaveLength(LIMITS.MAX_HISTORY)
    expect(state.history[0].roundId).toBe('old2')
    expect(state.history.at(-1)?.finalScore).toBe('5')
  })

  it('acumula un historial completo a lo largo de varias rondas', () => {
    let s = table()
    const rounds = [
      { story: 'HU-1', votes: ['3', '3', '5'], score: '3' },
      { story: 'HU-2', votes: ['8', '13', '?'], score: '13' },
      { story: 'HU-3', votes: ['1', '1', '1'], score: '1' },
    ]
    const ids = [HOST, U1, U2]
    s = ok(s, user({ type: 'SET_STORY', story: rounds[0].story }, HOST))
    rounds.forEach((round, index) => {
      expect(s.round.number).toBe(index + 1)
      expect(s.round.story).toBe(round.story)
      round.votes.forEach((value, i) => {
        s = ok(s, user({ type: 'VOTE', value }, ids[i]))
      })
      s = ok(s, user({ type: 'REVEAL' }, HOST))
      const nextStory = rounds[index + 1]?.story
      s = ok(s, user({ type: 'FINISH_ROUND', finalScore: round.score, nextStory }, HOST))
    })
    expect(s.round.number).toBe(4)
    expect(s.round.story).toBe('')
    expect(s.round.votes).toEqual({})
    expect(s.history.map((h) => [h.number, h.story, h.finalScore])).toEqual([
      [1, 'HU-1', '3'],
      [2, 'HU-2', '13'],
      [3, 'HU-3', '1'],
    ])
    expect(s.history.map((h) => h.stats.suggested)).toEqual(['3', '13', '1'])
    expect(s.history[2].stats.consensus).toBe(true)
    expect(new Set(s.history.map((h) => h.roundId)).size).toBe(3)
    expect(s.history[0].votes.map((v) => v.name)).toEqual(['Ana', 'Luis', 'Pedro'])
  })
})

describe('KICK', () => {
  it('expulsa, limpia voto y rol, y bloquea el reingreso', () => {
    let s = table()
    s = ok(s, user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    s = ok(s, user({ type: 'VOTE', value: '5' }, U1))
    const { state, events } = okWithEvents(s, user({ type: 'KICK', userId: U1 }, HOST))
    expect(state.participants.map((p) => p.id)).toEqual([HOST, U2])
    expect(state.round.votes).toEqual({})
    expect(state.admins).toEqual([HOST])
    expect(state.kicked).toEqual([U1])
    expect(events).toEqual([{ type: 'participant.kicked', userId: U1, name: 'Luis', by: HOST }])
    fails(state, join(U1, 'Luis'), 'kicked')
    fails(state, user({ type: 'VOTE', value: '5' }, U1), 'not-participant')
  })

  it('rechaza a uno mismo, al host y a desconocidos; noop si ya fue expulsado', () => {
    const s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    fails(s, user({ type: 'KICK', userId: HOST }, HOST), 'cannot-target-self')
    fails(s, user({ type: 'KICK', userId: U1 }, U1), 'cannot-target-self')
    fails(s, user({ type: 'KICK', userId: HOST }, U1), 'cannot-target-host')
    fails(s, user({ type: 'KICK', userId: 'nadie' }, HOST), 'unknown-user')
    fails(s, user({ type: 'KICK', userId: 7 as never }, HOST), 'unknown-user')
    const kicked = ok(s, user({ type: 'KICK', userId: U2 }, U1))
    isNoop(kicked, user({ type: 'KICK', userId: U2 }, HOST))
  })

  it('puede expulsar a un participante desconectado', () => {
    const away = ok(table(), { type: 'DISCONNECT', userId: U2, at: NOW })
    const state = ok(away, user({ type: 'KICK', userId: U2 }, HOST))
    expect(state.kicked).toEqual([U2])
  })
})

describe('GRANT_ADMIN y REVOKE_ADMIN', () => {
  it('otorga admin y emite admin.granted', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    expect(state.admins).toEqual([HOST, U1])
    expect(events).toEqual([{ type: 'admin.granted', userId: U1, by: HOST }])
    // Un admin delegado puede delegar a su vez.
    ok(state, user({ type: 'GRANT_ADMIN', userId: U2 }, U1))
  })

  it('GRANT_ADMIN rechaza desconocidos y es noop si ya es admin', () => {
    fails(table(), user({ type: 'GRANT_ADMIN', userId: 'nadie' }, HOST), 'unknown-user')
    isNoop(table(), user({ type: 'GRANT_ADMIN', userId: HOST }, HOST))
    const s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    isNoop(s, user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
  })

  it('REVOKE_ADMIN quita el rol, protege al host y permite auto-revocarse', () => {
    const s = ok(table(), user({ type: 'GRANT_ADMIN', userId: U1 }, HOST))
    fails(s, user({ type: 'REVOKE_ADMIN', userId: HOST }, HOST), 'cannot-target-host')
    fails(s, user({ type: 'REVOKE_ADMIN', userId: HOST }, U1), 'cannot-target-host')
    isNoop(s, user({ type: 'REVOKE_ADMIN', userId: U2 }, HOST))
    isNoop(s, user({ type: 'REVOKE_ADMIN', userId: 'nadie' }, HOST))
    const revoked = okWithEvents(s, user({ type: 'REVOKE_ADMIN', userId: U1 }, HOST))
    expect(revoked.state.admins).toEqual([HOST])
    expect(revoked.events).toEqual([{ type: 'admin.revoked', userId: U1, by: HOST }])
    const self = ok(s, user({ type: 'REVOKE_ADMIN', userId: U1 }, U1))
    expect(self.admins).toEqual([HOST])
    fails(self, user({ type: 'REVEAL' }, U1), 'not-admin')
  })
})

describe('CHAT', () => {
  it('agrega el mensaje con id determinista y emite chat.message', () => {
    const s = table()
    const { state, events } = okWithEvents(s, user({ type: 'CHAT', text: '  hola\n¿qué tal?  ' }, U1, NOW + 3))
    const message: ChatMessage = { id: `m${state.version}`, userId: U1, name: 'Luis', text: 'hola\n¿qué tal?', at: NOW + 3 }
    expect(state.chat).toEqual([message])
    expect(events).toEqual([{ type: 'chat.message', message }])
    const again = ok(state, user({ type: 'CHAT', text: 'otro' }, HOST))
    expect(again.chat.map((m) => m.id)).toEqual([`m${state.version}`, `m${again.version}`])
  })

  it('rechaza texto vacío o demasiado largo', () => {
    fails(table(), user({ type: 'CHAT', text: '   ' }, U1), 'invalid-text')
    fails(table(), user({ type: 'CHAT', text: 'x'.repeat(LIMITS.MAX_CHAT_TEXT + 1) }, U1), 'invalid-text')
    fails(table(), user({ type: 'CHAT', text: 42 as never }, U1), 'invalid-text')
    ok(table(), user({ type: 'CHAT', text: 'x'.repeat(LIMITS.MAX_CHAT_TEXT) }, U1))
  })

  it('recorta el chat a MAX_CHAT_MESSAGES', () => {
    const s = table()
    const full: TableState = { ...s, chat: Array.from({ length: LIMITS.MAX_CHAT_MESSAGES }, (_, i) => chatMessage(i)) }
    const state = ok(full, user({ type: 'CHAT', text: 'último' }, U1))
    expect(state.chat).toHaveLength(LIMITS.MAX_CHAT_MESSAGES)
    expect(state.chat[0].id).toBe('old1')
    expect(state.chat.at(-1)?.text).toBe('último')
  })
})

describe('REACT', () => {
  it('guarda la reacción en el participante y emite reaction', () => {
    const { state, events } = okWithEvents(table(), user({ type: 'REACT', emoji: '🎉' }, U2, NOW + 4))
    expect(state.participants[2].reaction).toEqual({ emoji: '🎉', at: NOW + 4 })
    expect(state.participants[0].reaction).toBeUndefined()
    expect(events).toEqual([{ type: 'reaction', userId: U2, emoji: '🎉' }])
    const later = ok(state, user({ type: 'REACT', emoji: '🎉' }, U2, NOW + 9))
    expect(later.participants[2].reaction).toEqual({ emoji: '🎉', at: NOW + 9 })
  })

  it('rechaza emojis fuera de la lista', () => {
    fails(table(), user({ type: 'REACT', emoji: '🦄' }, U1), 'invalid-emoji')
    fails(table(), user({ type: 'REACT', emoji: '' }, U1), 'invalid-emoji')
    fails(table(), user({ type: 'REACT', emoji: 1 as never }, U1), 'invalid-emoji')
    for (const emoji of REACTION_EMOJIS) ok(table(), user({ type: 'REACT', emoji }, U1))
  })
})

describe('robustez', () => {
  it('nunca lanza ante acciones malformadas', () => {
    const s = deepFreeze(table())
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'VOTE',
      {},
      { type: 'FOO', by: U1, at: NOW },
      { type: 'VOTE' },
      { type: 'JOIN', at: NOW },
      { type: 'FINISH_ROUND', by: HOST, at: NOW, finalScore: {} },
    ]
    for (const action of garbage) {
      const result = reduce(s, action as Action)
      expect(result.state).toBe(s)
      expect(result.events).toEqual([])
      expect(result.error).toBeDefined()
    }
  })

  it('es determinista', () => {
    const s = table()
    const action = user({ type: 'CHAT', text: 'hola' }, U1, NOW + 1)
    expect(reduce(s, action)).toEqual(reduce(s, action))
  })

  it('no muta la entrada en un flujo completo', () => {
    const s = table()
    const snapshot = JSON.stringify(s)
    let current = s
    const flow: Action[] = [
      user({ type: 'SET_STORY', story: 'HU-1' }, HOST),
      user({ type: 'VOTE', value: '5' }, U1),
      user({ type: 'VOTE', value: '8' }, U2),
      user({ type: 'REACT', emoji: '🔥' }, U1),
      user({ type: 'CHAT', text: 'listo' }, U2),
      user({ type: 'REVEAL' }, HOST),
      user({ type: 'FINISH_ROUND', finalScore: '8', nextStory: 'HU-2' }, HOST),
      user({ type: 'GRANT_ADMIN', userId: U1 }, HOST),
      user({ type: 'KICK', userId: U2 }, U1),
      { type: 'DISCONNECT', userId: U1, at: NOW },
      join(U1, 'Luis'),
      user({ type: 'CLOSE_TABLE' }, HOST),
    ]
    for (const action of flow) current = ok(current, action)
    expect(JSON.stringify(s)).toBe(snapshot)
    expect(current.version).toBe(s.version + flow.length)
    expect(current.closed).toBe(true)
  })

  it('la versión solo avanza con acciones aplicadas', () => {
    const s = table()
    expect(s.version).toBe(2)
    fails(s, user({ type: 'REVEAL' }, HOST), 'no-votes')
    isNoop(s, user({ type: 'SET_NAME', name: 'Luis' }, U1))
    const next = ok(s, user({ type: 'VOTE', value: '1' }, U1))
    expect(next.version).toBe(3)
  })
})

describe('salidas con la ronda revelada', () => {
  it('LEAVE conserva voto y nombre para resultados e historial', () => {
    const before = revealedTable()
    const { state } = okWithEvents(before, { type: 'LEAVE', userId: U2, at: NOW })
    expect(state.participants.some((p) => p.id === U2)).toBe(false)
    expect(state.round.votes[U2]).toBe('8')
    const name = before.participants.find((p) => p.id === U2)?.name
    expect(state.round.departedNames).toEqual({ [U2]: name })

    const finished = ok(state, user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST))
    expect(finished.history[0].votes).toContainEqual({ userId: U2, name, value: '8' })
    expect(finished.history[0].stats.count).toBe(3)
    expect(finished.round.departedNames).toBeUndefined()
  })

  it('KICK también conserva voto y nombre, y sigue retirando el rol', () => {
    const before = ok(revealedTable(), user({ type: 'GRANT_ADMIN', userId: U2 }, HOST))
    const state = ok(before, user({ type: 'KICK', userId: U2 }, HOST))
    expect(state.round.votes[U2]).toBe('8')
    expect(Object.keys(state.round.departedNames ?? {})).toEqual([U2])
    expect(state.admins).not.toContain(U2)
  })

  it('antes de revelar, quien sale sí pierde su voto', () => {
    let s = ok(table(), user({ type: 'VOTE', value: '5' }, U1))
    s = ok(s, { type: 'LEAVE', userId: U1, at: NOW })
    expect(Object.hasOwn(s.round.votes, U1)).toBe(false)
    expect(s.round.departedNames).toBeUndefined()
  })

  it('quien salió sin votar no deja rastro', () => {
    let s = ok(table(), user({ type: 'VOTE', value: '5' }, HOST))
    s = ok(s, user({ type: 'REVEAL' }, HOST))
    s = ok(s, { type: 'LEAVE', userId: U1, at: NOW })
    expect(s.round.departedNames).toBeUndefined()
  })

  it('FINISH_ROUND sin votos se rechaza con empty', () => {
    const s = revealedTable()
    const empty: TableState = { ...s, round: { ...s.round, votes: {} } }
    fails(empty, user({ type: 'FINISH_ROUND', finalScore: '5' }, HOST), 'empty')
  })
})

describe('caracteres invisibles', () => {
  it('rechaza nombres sin nada visible y limpia los de control bidi', () => {
    fails(table(), user({ type: 'SET_NAME', name: '\u200B\u2066\u00AD' }, U1), 'invalid-name')
    fails(table(), user({ type: 'SET_NAME', name: '\u200D' }, U1), 'invalid-name')
    fails(table(), join('nuevo', '\u200B'), 'invalid-name')
    const s = ok(table(), user({ type: 'SET_NAME', name: '\u202Eanitram' }, U1))
    expect(s.participants.find((p) => p.id === U1)?.name).toBe('anitram')
  })

  it('el chat conserva saltos de línea y emojis compuestos, pero no los controles', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
    const s = ok(table(), user({ type: 'CHAT', text: `hola\n\u202E${family} \u2764\uFE0F` }, U1))
    expect(s.chat[0].text).toBe(`hola\n${family} \u2764\uFE0F`)
    fails(table(), user({ type: 'CHAT', text: '\u200B\u200B' }, U1), 'invalid-text')
  })

  it('también limpia la historia', () => {
    const s = ok(table(), user({ type: 'SET_STORY', story: 'HU\u2067-1' }, HOST))
    expect(s.round.story).toBe('HU-1')
  })
})
