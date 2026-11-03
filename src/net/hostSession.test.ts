/**
 * Pruebas de HostSession con un transporte en memoria (dos extremos por conexión).
 * Usa el reducer real (src/domain), por lo que requiere que el módulo de dominio exista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, DomainEvent } from '@/domain/types'
import { DISCONNECT_GRACE_MS, HIDDEN_VOTE } from '@/domain/types'
import { createTableState } from '@/domain/table'
import type { ClientMessage, Conn, HostMessage, HostTransport } from '@/net/protocol'
import { PROTOCOL_VERSION, TransportError } from '@/net/protocol'
import { HostSession } from '@/net/hostSession'
import { createEventBus } from '@/store/eventBus'

// ---------------------------------------------------------------------------
// Transporte falso
// ---------------------------------------------------------------------------

class FakeConn implements Conn {
  peer!: FakeConn
  closed = false
  private readonly messageCbs = new Set<(msg: unknown) => void>()
  private readonly closeCbs = new Set<(reason?: string) => void>()

  constructor(readonly id: string) {}

  send(msg: unknown): void {
    if (this.closed) return
    // Clon JSON: como en la red, el receptor nunca comparte referencias con el emisor.
    const copy: unknown = JSON.parse(JSON.stringify(msg))
    this.peer.deliver(copy)
  }
  onMessage(cb: (msg: unknown) => void): () => void {
    this.messageCbs.add(cb)
    return () => {
      this.messageCbs.delete(cb)
    }
  }
  onClose(cb: (reason?: string) => void): () => void {
    this.closeCbs.add(cb)
    return () => {
      this.closeCbs.delete(cb)
    }
  }
  close(): void {
    if (this.closed) return
    this.finish()
    this.peer.finish()
  }
  deliver(msg: unknown): void {
    if (this.closed) return
    for (const cb of [...this.messageCbs]) cb(msg)
  }
  finish(): void {
    if (this.closed) return
    this.closed = true
    for (const cb of [...this.closeCbs]) cb('closed')
  }
}

class FakeHostTransport implements HostTransport {
  closeCalls = 0
  private onConnection: ((conn: Conn) => void) | null = null

  async listen(_code: string, onConnection: (conn: Conn) => void): Promise<void> {
    this.onConnection = onConnection
  }
  close(): void {
    this.closeCalls += 1
  }
  /** Simula la llegada de un cliente y devuelve su extremo. */
  connectClient(id: string): FakeConn {
    const hostSide = new FakeConn(`${id}:host`)
    const clientSide = new FakeConn(`${id}:client`)
    hostSide.peer = clientSide
    clientSide.peer = hostSide
    this.onConnection?.(hostSide)
    return clientSide
  }
}

type HelloMessage = Extract<ClientMessage, { t: 'hello' }>

class FakeClient {
  readonly received: HostMessage[] = []
  readonly conn: FakeConn
  private pinger: ReturnType<typeof setInterval> | null = null

  constructor(
    transport: FakeHostTransport,
    readonly id: string,
    readonly secret: string,
    readonly name: string,
  ) {
    this.conn = transport.connectClient(id)
    this.conn.onMessage((msg) => this.received.push(msg as HostMessage))
    this.conn.onClose(() => this.stopPinging())
    // Latido como el de ClientSession, para que el vigilante del host no nos corte.
    this.pinger = setInterval(() => this.conn.send({ t: 'ping' } satisfies ClientMessage), 4_000)
  }
  hello(overrides: Partial<HelloMessage> = {}): void {
    const msg: HelloMessage = {
      t: 'hello',
      proto: PROTOCOL_VERSION,
      id: this.id,
      secret: this.secret,
      name: this.name,
      ...overrides,
    }
    this.conn.send(msg)
  }
  cmd(seq: number, cmd: Command): void {
    this.conn.send({ t: 'cmd', seq, cmd } satisfies ClientMessage)
  }
  last<T extends HostMessage['t']>(t: T): Extract<HostMessage, { t: T }> | undefined {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const msg = this.received[i]
      if (msg.t === t) return msg as Extract<HostMessage, { t: T }>
    }
    return undefined
  }
  stopPinging(): void {
    if (this.pinger) clearInterval(this.pinger)
    this.pinger = null
  }
}

// ---------------------------------------------------------------------------
// Escenario
// ---------------------------------------------------------------------------

const CODE = 'ABC234'
const HOST = { id: 'host-1', secret: 'host-secret', name: 'Anfitrión' }

async function startHost() {
  const bus = createEventBus()
  const events: DomainEvent[] = []
  bus.subscribe((evs) => events.push(...evs))
  const transport = new FakeHostTransport()
  const state = createTableState({
    code: CODE,
    name: 'Sprint 12',
    host: { id: HOST.id, name: HOST.name },
    deck: 'fibonacci',
    now: Date.now(),
  })
  const session = new HostSession({ code: CODE, identity: HOST, transport, initial: state, bus })
  await session.start()
  return { session, transport, events }
}

function fakeLocalStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('HostSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', fakeLocalStorage())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('responde al hello con welcome y la proyección del recién llegado', async () => {
    const { session, transport } = await startHost()
    expect(session.getSnapshot().status).toBe('connected')
    expect(session.getSnapshot().state?.code).toBe(CODE)

    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()

    const welcome = ana.last('welcome')
    expect(welcome?.you).toBe('u-ana')
    expect(welcome?.state.code).toBe(CODE)
    expect(welcome?.state.participants.map((p) => p.id)).toContain('u-ana')
    expect(session.getAuthoritativeState().participants.find((p) => p.id === 'u-ana')?.connected).toBe(true)
  })

  it('difunde cada cmd como state proyectado: el voto ajeno viaja oculto', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    const luis = new FakeClient(transport, 'u-luis', 's-luis', 'Luis')
    ana.hello()
    luis.hello()

    ana.cmd(1, { type: 'VOTE', value: '5' })

    expect(session.getAuthoritativeState().round.votes['u-ana']).toBe('5')
    expect(ana.last('state')?.state.round.votes['u-ana']).toBe('5')
    const seenByLuis = luis.last('state')
    expect(seenByLuis?.state.round.votes['u-ana']).toBe(HIDDEN_VOTE)
    expect(seenByLuis?.events.some((e) => e.type === 'vote.cast' && e.userId === 'u-ana')).toBe(true)
    expect(ana.last('error')).toBeUndefined()

    // Un comando rechazado solo recibe 'error' en su propia conexión.
    luis.cmd(1, { type: 'REVEAL' })
    expect(luis.last('error')?.seq).toBe(1)
    expect(luis.last('error')?.code).toBe('not-admin')
    expect(ana.last('error')).toBeUndefined()
  })

  it('expulsa con rejected kicked y no deja volver a entrar', async () => {
    const { session, transport, events } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()

    session.dispatch({ type: 'KICK', userId: 'u-ana' })

    expect(session.getSnapshot().lastError).toBeNull()
    expect(events.some((e) => e.type === 'participant.kicked' && e.userId === 'u-ana')).toBe(true)
    expect(ana.last('rejected')?.reason).toBe('kicked')
    expect(ana.conn.closed).toBe(true)
    expect(session.getAuthoritativeState().participants.some((p) => p.id === 'u-ana')).toBe(false)

    const again = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    again.hello()
    expect(again.last('welcome')).toBeUndefined()
    expect(again.last('rejected')?.reason).toBe('kicked')
    expect(again.conn.closed).toBe(true)
  })

  it('rechaza con bad-secret a quien usa un id ajeno con otro secreto', async () => {
    const { transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()

    const impostor = new FakeClient(transport, 'u-ana', 'otro-secreto', 'Ana')
    impostor.hello()
    expect(impostor.last('welcome')).toBeUndefined()
    expect(impostor.last('rejected')?.reason).toBe('bad-secret')
    expect(impostor.conn.closed).toBe(true)

    // Otra pestaña del mismo usuario con el secreto correcto sí entra.
    const anaTab2 = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    anaTab2.hello()
    expect(anaTab2.last('welcome')?.you).toBe('u-ana')
  })

  it('marca DISCONNECT al caer la conexión y LEAVE pasada la gracia', async () => {
    const { session, transport, events } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    const luis = new FakeClient(transport, 'u-luis', 's-luis', 'Luis')
    ana.hello()
    luis.hello()

    ana.conn.close()

    expect(session.getAuthoritativeState().participants.find((p) => p.id === 'u-ana')?.connected).toBe(false)
    expect(luis.last('state')?.events.some((e) => e.type === 'participant.disconnected' && e.userId === 'u-ana')).toBe(
      true,
    )

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS - 1)
    expect(session.getAuthoritativeState().participants.some((p) => p.id === 'u-ana')).toBe(true)

    vi.advanceTimersByTime(1)
    expect(session.getAuthoritativeState().participants.some((p) => p.id === 'u-ana')).toBe(false)
    expect(events.some((e) => e.type === 'participant.left' && e.userId === 'u-ana')).toBe(true)
    expect(luis.last('state')?.events.some((e) => e.type === 'participant.left' && e.userId === 'u-ana')).toBe(true)
  })

  it('si reconecta antes de la gracia conserva al participante y cancela el LEAVE', async () => {
    const { session, transport, events } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    ana.conn.close()

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS / 2)
    const anaBack = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    anaBack.hello()
    expect(anaBack.last('welcome')?.state.participants.find((p) => p.id === 'u-ana')?.connected).toBe(true)

    vi.advanceTimersByTime(DISCONNECT_GRACE_MS)
    expect(session.getAuthoritativeState().participants.some((p) => p.id === 'u-ana')).toBe(true)
    expect(events.some((e) => e.type === 'participant.left')).toBe(false)
  })

  it('bye retira al participante de inmediato', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()

    ana.conn.send({ t: 'bye' } satisfies ClientMessage)

    expect(session.getAuthoritativeState().participants.some((p) => p.id === 'u-ana')).toBe(false)
    expect(ana.conn.closed).toBe(true)
  })

  it('CLOSE_TABLE avisa closed a todos, cierra el transporte y deja status closed', async () => {
    const { session, transport, events } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()

    session.dispatch({ type: 'CLOSE_TABLE' })

    expect(session.getSnapshot().status).toBe('closed')
    expect(events.some((e) => e.type === 'table.closed')).toBe(true)
    expect(ana.last('state')?.events.some((e) => e.type === 'table.closed')).toBe(true)
    expect(ana.last('closed')).toBeDefined()

    vi.advanceTimersByTime(1_000)
    expect(ana.conn.closed).toBe(true)
    expect(transport.closeCalls).toBe(1)
  })

  it('rechaza por cmd los comandos de sistema y los tipos desconocidos', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    const luis = new FakeClient(transport, 'u-luis', 's-luis', 'Luis')
    luis.hello()
    const before = session.getAuthoritativeState()

    const forged: unknown[] = [
      { type: 'LEAVE', userId: 'u-luis' },
      { type: 'DISCONNECT', userId: 'u-luis' },
      { type: 'JOIN', user: { id: HOST.id, name: 'Hackeado' } },
      { type: 'JOIN', user: { id: 'fantasma', name: 'x' } },
      { type: 'constructor' },
      { type: '__proto__' },
    ]
    forged.forEach((cmd, i) => {
      ana.conn.send({ t: 'cmd', seq: i + 1, cmd })
      expect(ana.last('error')).toMatchObject({ seq: i + 1, code: 'invalid-command' })
    })
    expect(session.getAuthoritativeState()).toBe(before)
  })

  it('rechaza un hello con id fuera de formato o reservado, o con secreto enorme', async () => {
    const { session, transport } = await startHost()
    for (const id of ['__proto__', 'constructor', 'con espacio', 'x'.repeat(65)]) {
      const c = new FakeClient(transport, id, 's', 'Z')
      c.hello()
      expect(c.last('rejected')?.reason).toBe('protocol')
      c.stopPinging()
    }
    const big = new FakeClient(transport, 'u-big', 's'.repeat(129), 'Z')
    big.hello()
    expect(big.last('rejected')?.reason).toBe('protocol')
    big.stopPinging()
    expect(session.getAuthoritativeState().participants).toHaveLength(1)
  })

  it('un nombre sin nada visible entra como invitado en vez de ser rechazado', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', '\u200B')
    ana.hello()
    expect(ana.last('welcome')).toBeDefined()
    expect(session.getAuthoritativeState().participants.find((p) => p.id === 'u-ana')?.name).toBe('Invitado')
  })

  it('limita los cmd por conexión: descarta el exceso, avisa una vez y corta si persiste', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    const luis = new FakeClient(transport, 'u-luis', 's-luis', 'Luis')
    luis.hello()
    const chats = () => session.getAuthoritativeState().chat.filter((m) => !m.system).length

    for (let i = 1; i <= 20; i++) ana.cmd(i, { type: 'CHAT', text: `m${i}` })
    expect(chats()).toBe(20)
    expect(ana.last('error')).toBeUndefined()

    ana.cmd(21, { type: 'CHAT', text: 'exceso' })
    ana.cmd(22, { type: 'CHAT', text: 'exceso' })
    expect(chats()).toBe(20)
    expect(ana.received.filter((m) => m.t === 'error')).toEqual([
      expect.objectContaining({ seq: 21, code: 'rate-limited' }),
    ])

    // La limitación es por conexión: los demás siguen con normalidad, y los pings no se pierden.
    luis.cmd(1, { type: 'CHAT', text: 'hola' })
    expect(chats()).toBe(21)
    ana.conn.send({ t: 'ping' } satisfies ClientMessage)
    expect(ana.last('pong')).toBeDefined()

    for (let i = 0; i < 98; i++) ana.cmd(100 + i, { type: 'CHAT', text: 'x' })
    expect(ana.conn.closed).toBe(true)
    expect(chats()).toBe(21)
    expect(luis.conn.closed).toBe(false)
  })

  it('el uso normal nunca se limita, ni con ráfagas separadas', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    let seq = 0
    for (let burst = 0; burst < 5; burst++) {
      for (let i = 0; i < 10; i++) ana.cmd(++seq, { type: 'CHAT', text: 'hola' })
      vi.advanceTimersByTime(1_000)
    }
    expect(ana.last('error')).toBeUndefined()
    expect(session.getAuthoritativeState().chat.filter((m) => !m.system)).toHaveLength(50)
  })

  it('olvida los secretos de los ausentes más antiguos pero no los de quienes están', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    const ghosts = (n: number) => {
      for (let i = 0; i < n; i++) {
        const c = new FakeClient(transport, `g${i}`, 's', 'G')
        c.hello()
        c.conn.send({ t: 'bye' } satisfies ClientMessage)
        c.stopPinging()
      }
    }
    ghosts(250)
    session.leave()
    const stored = JSON.parse(localStorage.getItem(`sp:host:${CODE}`) ?? '{}') as { secrets: Record<string, string> }
    const ids = Object.keys(stored.secrets)
    expect(ids.length).toBeLessThanOrEqual(200)
    expect(ids).toEqual(expect.arrayContaining([HOST.id, 'u-ana', 'g249']))
    expect(ids).not.toContain('g0')
  })

  it('avisa una sola vez por tanda si no puede guardar la mesa', async () => {
    const { session, transport } = await startHost()
    const ana = new FakeClient(transport, 'u-ana', 's-ana', 'Ana')
    ana.hello()
    vi.advanceTimersByTime(200)
    expect(session.getSnapshot().lastError).toBeNull()

    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    ana.cmd(1, { type: 'CHAT', text: 'a' })
    vi.advanceTimersByTime(200)
    const first = session.getSnapshot().lastError
    expect(first?.code).toBe('persist-failed')

    ana.cmd(2, { type: 'CHAT', text: 'b' })
    vi.advanceTimersByTime(200)
    expect(session.getSnapshot().lastError).toBe(first)
    setItem.mockRestore()
  })

  it('si falla al arrancar con el transporte abierto, lo libera y queda en error', async () => {
    const transport = new FakeHostTransport()
    const good = createTableState({
      code: CODE,
      name: 'x',
      host: { id: HOST.id, name: HOST.name },
      deck: 'fibonacci',
      now: Date.now(),
    })
    const broken = { ...good, round: {} } as unknown as typeof good
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = new HostSession({
      code: CODE,
      identity: HOST,
      transport,
      initial: { resume: { state: broken, secrets: {} } },
      bus: createEventBus(),
    })
    await expect(session.start()).rejects.toThrow()
    expect(transport.closeCalls).toBe(1)
    expect(session.getSnapshot().status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
    logged.mockRestore()
  })

  it('un code-taken no se publica: lo decide quien llamó', async () => {
    const transport = new FakeHostTransport()
    vi.spyOn(transport, 'listen').mockRejectedValue(new TransportError('code-taken'))
    const session = new HostSession({
      code: CODE,
      identity: HOST,
      transport,
      initial: createTableState({
        code: CODE,
        name: 'x',
        host: { id: HOST.id, name: HOST.name },
        deck: 'fibonacci',
        now: Date.now(),
      }),
      bus: createEventBus(),
    })
    await expect(session.start()).rejects.toThrow()
    expect(session.getSnapshot().status).toBe('connecting')
    expect(session.getSnapshot().lastError).toBeNull()
  })
})
