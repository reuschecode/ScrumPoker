/**
 * Pruebas de ClientSession con un transporte falso cuyo "host" se guioniza en cada prueba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DomainEvent, TableState } from '@/domain/types'
import { createTableState } from '@/domain/table'
import type { ClientMessage, ClientTransport, Conn, HostMessage } from '@/net/protocol'
import { PROTOCOL_VERSION, TransportError } from '@/net/protocol'
import { ClientSession } from '@/net/clientSession'
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

/** Extremo del host: registra lo recibido y responde al hello según `onHello`. */
class FakeHostEnd {
  readonly received: ClientMessage[] = []
  readonly conn: FakeConn
  readonly clientSide: FakeConn

  constructor(id: string, onHello: (end: FakeHostEnd) => void, autoPong = true) {
    this.conn = new FakeConn(`${id}:host`)
    this.clientSide = new FakeConn(`${id}:client`)
    this.conn.peer = this.clientSide
    this.clientSide.peer = this.conn
    this.conn.onMessage((msg) => {
      const m = msg as ClientMessage
      this.received.push(m)
      if (m.t === 'hello') onHello(this)
      if (m.t === 'ping' && autoPong) this.send({ t: 'pong' })
    })
  }
  send(msg: HostMessage): void {
    this.conn.send(msg)
  }
  last<T extends ClientMessage['t']>(t: T): Extract<ClientMessage, { t: T }> | undefined {
    for (let i = this.received.length - 1; i >= 0; i--) {
      const msg = this.received[i]
      if (msg.t === t) return msg as Extract<ClientMessage, { t: T }>
    }
    return undefined
  }
}

type ConnectScript = (attempt: number) => FakeHostEnd | TransportError

class FakeClientTransport implements ClientTransport {
  attempts = 0
  readonly ends: FakeHostEnd[] = []
  constructor(private readonly script: ConnectScript) {}

  async connect(_code: string): Promise<Conn> {
    this.attempts += 1
    const result = this.script(this.attempts)
    if (result instanceof TransportError) throw result
    this.ends.push(result)
    return result.clientSide
  }
}

// ---------------------------------------------------------------------------
// Escenario
// ---------------------------------------------------------------------------

const CODE = 'ABC234'
const ME = { id: 'u-ana', secret: 's-ana', name: 'Ana' }

function tableState(version = 0): TableState {
  const base = createTableState({
    code: CODE,
    name: 'Sprint 12',
    host: { id: 'host-1', name: 'Anfitrión' },
    deck: 'fibonacci',
    now: Date.now(),
  })
  return { ...base, version }
}

function welcoming(id: string, state = tableState(), autoPong = true): FakeHostEnd {
  return new FakeHostEnd(id, (end) => end.send({ t: 'welcome', you: ME.id, state }), autoPong)
}

function makeSession(script: ConnectScript) {
  const bus = createEventBus()
  const events: DomainEvent[] = []
  bus.subscribe((evs) => events.push(...evs))
  const transport = new FakeClientTransport(script)
  const session = new ClientSession({ code: CODE, identity: ME, transport, bus })
  return { session, transport, events }
}

describe('ClientSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('envía hello, queda connected al recibir welcome y numera los cmd', async () => {
    const { session, transport, events } = makeSession(() => welcoming('c1'))
    await session.start()

    const host = transport.ends[0]
    expect(host.last('hello')).toMatchObject({ proto: PROTOCOL_VERSION, id: ME.id, secret: ME.secret, name: ME.name })
    expect(session.getSnapshot().status).toBe('connected')
    expect(session.getSnapshot().state?.code).toBe(CODE)
    expect(events).toHaveLength(0) // el welcome no emite eventos

    session.dispatch({ type: 'VOTE', value: '3' })
    session.dispatch({ type: 'CHAT', text: 'hola' })
    expect(host.received.filter((m) => m.t === 'cmd').map((m) => (m.t === 'cmd' ? m.seq : -1))).toEqual([1, 2])
    expect(host.last('cmd')?.cmd).toEqual({ type: 'CHAT', text: 'hola' })
  })

  it('refleja cada state, publica sus eventos en el bus e ignora snapshots viejos', async () => {
    const { session, transport, events } = makeSession(() => welcoming('c1', tableState(5)))
    await session.start()
    const host = transport.ends[0]

    const newer = { ...tableState(6), name: 'Renombrada' }
    host.send({ t: 'state', state: newer, events: [{ type: 'table.renamed', name: 'Renombrada', by: 'host-1' }] })
    expect(session.getSnapshot().state?.name).toBe('Renombrada')
    expect(events).toEqual([{ type: 'table.renamed', name: 'Renombrada', by: 'host-1' }])

    host.send({ t: 'state', state: { ...tableState(4), name: 'Vieja' }, events: [] })
    expect(session.getSnapshot().state?.name).toBe('Renombrada')

    host.send({ t: 'error', seq: 1, code: 'not-admin', message: 'Solo un admin puede hacer eso' })
    expect(session.getSnapshot().lastError?.code).toBe('not-admin')
  })

  it('traduce rejected y closed a estados terminales sin reconectar', async () => {
    const full = makeSession(() => new FakeHostEnd('c1', (end) => end.send({ t: 'rejected', reason: 'full' })))
    await full.session.start()
    expect(full.session.getSnapshot().status).toBe('error')
    expect(full.session.getSnapshot().lastError?.message).toBe('La mesa está llena')

    const kicked = makeSession(() => new FakeHostEnd('c1', (end) => end.send({ t: 'rejected', reason: 'kicked' })))
    await kicked.session.start()
    expect(kicked.session.getSnapshot().status).toBe('kicked')

    const closed = makeSession(() => welcoming('c1'))
    await closed.session.start()
    closed.transport.ends[0].send({ t: 'closed' })
    expect(closed.session.getSnapshot().status).toBe('closed')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(full.transport.attempts).toBe(1)
    expect(kicked.transport.attempts).toBe(1)
    expect(closed.transport.attempts).toBe(1)
  })

  it('tras 3 intentos sin host queda not-found', async () => {
    const { session, transport } = makeSession(() => new TransportError('not-found'))
    const started = session.start()
    await vi.advanceTimersByTimeAsync(10_000)
    await started
    expect(transport.attempts).toBe(3)
    expect(session.getSnapshot().status).toBe('not-found')
  })

  it('un fallo de red en el primer intento es error definitivo', async () => {
    const { session, transport } = makeSession(() => new TransportError('network', 'Sin red'))
    await session.start()
    expect(transport.attempts).toBe(1)
    expect(session.getSnapshot().status).toBe('error')
    expect(session.getSnapshot().lastError?.code).toBe('network')
  })

  it('si la conexión cae, reconecta con backoff conservando el estado y reemplaza por el nuevo welcome', async () => {
    const { session, transport, events } = makeSession((attempt) =>
      attempt === 1 ? welcoming('c1', tableState(1)) : attempt === 2 ? new TransportError('not-found') : welcoming('c3', tableState(9)),
    )
    await session.start()
    expect(session.getSnapshot().status).toBe('connected')

    transport.ends[0].conn.close() // el host desaparece
    expect(session.getSnapshot().status).toBe('reconnecting')
    expect(session.getSnapshot().state?.version).toBe(1)

    session.dispatch({ type: 'VOTE', value: '5' })
    expect(session.getSnapshot().lastError?.code).toBe('offline')

    await vi.advanceTimersByTimeAsync(1_000) // 1.er reintento (falla)
    expect(transport.attempts).toBe(2)
    expect(session.getSnapshot().status).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(2_000) // 2.º reintento (entra)
    expect(transport.attempts).toBe(3)
    expect(session.getSnapshot().status).toBe('connected')
    expect(session.getSnapshot().state?.version).toBe(9)
    expect(events).toHaveLength(0)
  })

  it('se rinde tras 3 minutos reintentando', async () => {
    const { session, transport } = makeSession((attempt) =>
      attempt === 1 ? welcoming('c1') : new TransportError('not-found'),
    )
    await session.start()

    transport.ends[0].conn.close()
    expect(session.getSnapshot().status).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(3 * 60_000 + 10_000)
    expect(session.getSnapshot().status).toBe('error')
    expect(session.getSnapshot().lastError?.message).toBe('No se pudo reconectar con la mesa')
    // Backoff 1, 2, 4, 8, 8… s: muchos intentos, pero acotados.
    expect(transport.attempts).toBeGreaterThan(10)
    expect(transport.attempts).toBeLessThan(40)
  })

  it('sin pong durante 12 s da la conexión por caída y reconecta', async () => {
    const { session, transport } = makeSession((attempt) =>
      attempt === 1 ? welcoming('c1', tableState(), false) : welcoming('c2'),
    )
    await session.start()
    const mute = transport.ends[0]

    await vi.advanceTimersByTimeAsync(12_000)
    expect(mute.received.filter((m) => m.t === 'ping').length).toBeGreaterThanOrEqual(3)
    expect(session.getSnapshot().status).toBe('connected')

    await vi.advanceTimersByTimeAsync(8_000)
    expect(mute.conn.closed).toBe(true)
    expect(['reconnecting', 'connected']).toContain(session.getSnapshot().status)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(session.getSnapshot().status).toBe('connected')
    expect(transport.attempts).toBe(2)
  })

  it('un temporizador retrasado por una pestaña oculta no se confunde con una caída', async () => {
    const { session, transport } = makeSession(() => welcoming('c1'))
    await session.start()
    await vi.advanceTimersByTimeAsync(4_000)

    // El reloj avanza un minuto sin que corra el intervalo, como en una pestaña en segundo plano.
    vi.setSystemTime(Date.now() + 60_000)
    await vi.advanceTimersByTimeAsync(4_000)

    expect(transport.ends[0].conn.closed).toBe(false)
    expect(session.getSnapshot().status).toBe('connected')
  })

  it('al cerrar o recargar la página avisa leaving al host', async () => {
    const page = new EventTarget()
    vi.stubGlobal('window', page)
    try {
      const { session, transport } = makeSession(() => welcoming('c1'))
      await session.start()
      page.dispatchEvent(new Event('pagehide'))
      expect(transport.ends[0].last('leaving')).toBeDefined()
      session.leave()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('leave envía bye, cierra y cancela reintentos', async () => {
    const { session, transport } = makeSession(() => welcoming('c1'))
    await session.start()
    const host = transport.ends[0]

    session.leave()
    expect(host.last('bye')).toBeDefined()
    expect(host.conn.closed).toBe(true)
    expect(session.getSnapshot().status).toBe('idle')

    await vi.advanceTimersByTimeAsync(60_000)
    expect(transport.attempts).toBe(1)
  })

  it('cada hello lleva el nombre vigente, no el del momento de crear la sesión', async () => {
    let name = 'Ana'
    const transport = new FakeClientTransport((attempt) => welcoming(`c${attempt}`))
    const session = new ClientSession({
      code: CODE,
      identity: ME,
      getName: () => name,
      transport,
      bus: createEventBus(),
    })
    await session.start()
    expect(transport.ends[0].last('hello')?.name).toBe('Ana')

    name = 'Ana G'
    transport.ends[0].conn.close()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(transport.ends[1].last('hello')?.name).toBe('Ana G')
  })

  it('ignora un state malformado o sin eventos, sin lanzar ni publicarlo', async () => {
    const { session, transport, events } = makeSession(() => welcoming('c1', tableState(1)))
    await session.start()
    const host = transport.ends[0]
    const good = session.getSnapshot().state
    const send = (msg: unknown) => host.conn.send(msg)

    send({ t: 'state', state: { version: 999 }, events: [] })
    send({ t: 'state', state: tableState(5) })
    send({ t: 'state', state: { ...tableState(5), admins: 'x' }, events: [] })
    send({ t: 'state', state: { ...tableState(5), chat: [{ id: 'm', userId: 'u', name: 'n', text: 't', at: 1e300 }] }, events: [] })
    send({ t: 'state', state: tableState(5), events: [{ nope: 1 }] })
    send({ t: 'error', seq: 1, code: {}, message: {} })
    expect(session.getSnapshot().state).toBe(good)
    expect(session.getSnapshot().lastError).toBeNull()
    expect(events).toHaveLength(0)

    send({ t: 'state', state: tableState(5), events: [] })
    expect(session.getSnapshot().state?.version).toBe(5)
  })

  it('un welcome malformado no deja entrar: acaba como un intento fallido', async () => {
    const bad = () => new FakeHostEnd('c', (end) => end.conn.send({ t: 'welcome', you: ME.id, state: { version: 1 } }))
    const { session, transport } = makeSession(bad)
    const started = session.start()
    await vi.advanceTimersByTimeAsync(10_000 * 3 + 1_500 * 2)
    await started
    expect(transport.attempts).toBe(3)
    expect(session.getSnapshot().status).toBe('not-found')
    expect(session.getSnapshot().state).toBeNull()
  })
})
