/**
 * Sesión de cliente: una conexión con el host. Envía 'hello', espera 'welcome' y a partir de
 * ahí refleja cada 'state' recibido. Si la conexión se cae sin que lo pidamos, reintenta con
 * backoff conservando el último estado para seguir mostrando la mesa.
 */
import type { Command, TableState } from '@/domain/types'
import type {
  ClientMessage,
  ClientTransport,
  Conn,
  ConnectionStatus,
  Identity,
  Session,
  SessionSnapshot,
} from '@/net/protocol'
import { PROTOCOL_VERSION, TransportError, isHostMessage } from '@/net/protocol'
import { isDomainEventList, isTableState } from '@/domain/validate'
import { eventBus } from '@/store/eventBus'
import type { EventBus, EventListener } from '@/store/types'

export interface ClientSessionOptions {
  code: string
  identity: Identity
  /** Nombre vigente para cada 'hello': puede haber cambiado desde que se creó la sesión. */
  getName?: () => string
  transport: ClientTransport
  /** Bus al que se publican los eventos (por defecto el global; inyectable en tests). */
  bus?: EventBus
  /** Reloj (inyectable en tests). */
  now?: () => number
}

const WELCOME_TIMEOUT_MS = 10_000
/** Intentos iniciales: el host puede estar refrescando la página. */
const INITIAL_ATTEMPTS = 3
const INITIAL_RETRY_DELAY_MS = 1_500
const PING_INTERVAL_MS = 4_000
const LIVENESS_TIMEOUT_MS = 12_000
const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const
const RECONNECT_WINDOW_MS = 3 * 60_000

type AttemptOutcome = 'ok' | 'retry' | 'fatal' | 'terminal'
type SnapshotError = NonNullable<SessionSnapshot['lastError']>

export class ClientSession implements Session {
  readonly role = 'client' as const
  readonly code: string

  private readonly identity: Identity
  private readonly getName: () => string
  private readonly transport: ClientTransport
  private readonly bus: EventBus
  private readonly now: () => number

  private conn: Conn | null = null
  private seq = 0
  private lastActivity = 0

  private snap: SessionSnapshot
  private readonly snapListeners = new Set<(snap: SessionSnapshot) => void>()
  private readonly eventListeners = new Set<EventListener>()

  private pingTimer: ReturnType<typeof setInterval> | null = null
  private unansweredPingAt: number | null = null
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWelcome: ((outcome: AttemptOutcome) => void) | null = null
  private sleepTimer: ReturnType<typeof setTimeout> | null = null
  private sleepResolve: (() => void) | null = null
  private reconnectDeadline = 0
  private reconnectAttempt = 0

  private started = false
  /** Al cerrar o recargar la página, avisa al host para que no espere a detectar la caída. */
  private readonly onPageHide = () => {
    try {
      this.conn?.send({ t: 'leaving' } satisfies ClientMessage)
    } catch {
      /* ya caída */
    }
  }
  /** true cuando la sesión terminó (leave, expulsión, cierre o fallo definitivo). */
  private stopped = false

  constructor(opts: ClientSessionOptions) {
    this.code = opts.code
    this.identity = opts.identity
    this.getName = opts.getName ?? (() => opts.identity.name)
    this.transport = opts.transport
    this.bus = opts.bus ?? eventBus
    this.now = opts.now ?? (() => Date.now())
    this.snap = {
      role: 'client',
      code: this.code,
      status: 'idle',
      state: null,
      me: this.identity.id,
      lastError: null,
    }
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  /** Resuelve cuando hay estado o cuando el fallo es definitivo (reflejado en `status`). Nunca lanza. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide)
    this.setSnap({ status: 'connecting', lastError: null })
    for (let attempt = 1; attempt <= INITIAL_ATTEMPTS; attempt++) {
      if (this.stopped) return
      const outcome = await this.attempt('initial')
      if (outcome !== 'retry') return
      if (attempt < INITIAL_ATTEMPTS) await this.sleep(INITIAL_RETRY_DELAY_MS)
    }
    if (!this.stopped) {
      this.terminate(
        'not-found',
        { code: 'not-found', message: 'Esta mesa no existe o el anfitrión no está conectado' },
        'fatal',
      )
    }
  }

  dispatch(cmd: Command): void {
    if (this.snap.status === 'connected' && this.conn) {
      this.seq += 1
      this.send({ t: 'cmd', seq: this.seq, cmd })
      return
    }
    this.setSnap({ lastError: { code: 'offline', message: 'Sin conexión con la mesa', at: this.now() } })
  }

  leave(): void {
    this.stopped = true
    this.removePageHide()
    this.clearSleep()
    const conn = this.conn
    this.conn = null
    this.stopPing()
    if (conn) {
      try {
        conn.send({ t: 'bye' } satisfies ClientMessage)
      } catch {
        /* ya caída */
      }
      conn.close()
    }
    this.settleWelcome('terminal')
    this.setSnap({ status: 'idle' })
  }

  getSnapshot(): SessionSnapshot {
    return this.snap
  }

  subscribe(listener: (snap: SessionSnapshot) => void): () => void {
    this.snapListeners.add(listener)
    return () => {
      this.snapListeners.delete(listener)
    }
  }

  onEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  // ---------------------------------------------------------------------------
  // Conexión
  // ---------------------------------------------------------------------------

  /** Un intento completo: connect → hello → welcome. */
  private async attempt(mode: 'initial' | 'reconnect'): Promise<AttemptOutcome> {
    let conn: Conn
    try {
      conn = await this.transport.connect(this.code)
    } catch (err) {
      const code = err instanceof TransportError ? err.code : 'network'
      if (code === 'unsupported' || (mode === 'initial' && code === 'network')) {
        this.terminate(
          'error',
          { code, message: err instanceof Error && err.message ? err.message : 'No se pudo conectar con la mesa' },
          'fatal',
        )
        return 'fatal'
      }
      return 'retry'
    }
    if (this.stopped) {
      conn.close()
      return 'terminal'
    }
    this.conn = conn
    this.lastActivity = this.now()
    conn.onMessage((msg) => this.onMessage(conn, msg))
    conn.onClose(() => this.onConnClosed(conn))
    // El resolutor se registra antes de enviar el hello: un transporte puede entregar el welcome en el acto.
    const outcome = new Promise<AttemptOutcome>((resolve) => {
      this.pendingWelcome = resolve
      this.welcomeTimer = setTimeout(() => {
        this.detachConn(true)
        this.settleWelcome('retry')
      }, WELCOME_TIMEOUT_MS)
    })
    this.send({
      t: 'hello',
      proto: PROTOCOL_VERSION,
      id: this.identity.id,
      secret: this.identity.secret,
      name: this.getName(),
    })
    return outcome
  }

  private settleWelcome(outcome: AttemptOutcome): void {
    if (this.welcomeTimer) {
      clearTimeout(this.welcomeTimer)
      this.welcomeTimer = null
    }
    const resolve = this.pendingWelcome
    this.pendingWelcome = null
    resolve?.(outcome)
  }

  private detachConn(close: boolean): void {
    const conn = this.conn
    this.conn = null
    this.stopPing()
    if (conn && close) conn.close()
  }

  private onMessage(conn: Conn, raw: unknown): void {
    if (conn !== this.conn || this.stopped || !isHostMessage(raw)) return
    this.lastActivity = this.now()
    switch (raw.t) {
      case 'welcome':
        if (!isTableState(raw.state)) return // sin welcome válido, el intento acaba por timeout
        this.reconnectAttempt = 0
        this.setSnap({ status: 'connected', state: raw.state })
        this.startPing()
        this.settleWelcome('ok')
        break
      case 'state':
        if (isTableState(raw.state) && isDomainEventList(raw.events)) this.onState(raw.state, raw.events)
        break
      case 'rejected':
        this.onRejected(raw.reason)
        break
      case 'error':
        if (typeof raw.code === 'string' && typeof raw.message === 'string') {
          this.setSnap({ lastError: { code: raw.code, message: raw.message, at: this.now() } })
        }
        break
      case 'closed':
        this.terminate('closed')
        break
      case 'pong':
        break
      default:
        break
    }
  }

  private onState(state: TableState, events: Parameters<EventListener>[0]): void {
    if (this.snap.status !== 'connected') return
    // Ignora snapshots viejos que lleguen desordenados.
    if (this.snap.state && state.version < this.snap.state.version) return
    this.setSnap({ state })
    this.emitEvents(events, state)
    if (events.some((e) => e.type === 'participant.kicked' && e.userId === this.identity.id)) this.terminate('kicked')
  }

  private onRejected(reason: string): void {
    switch (reason) {
      case 'kicked':
        this.terminate('kicked')
        break
      case 'closed':
        this.terminate('closed')
        break
      case 'full':
        this.terminate('error', { code: 'full', message: 'La mesa está llena' })
        break
      case 'bad-secret':
        this.terminate('error', {
          code: 'bad-secret',
          message: 'Tu identidad no coincide con la registrada en esta mesa',
        })
        break
      default:
        this.terminate('error', { code: 'protocol', message: 'Versión incompatible' })
    }
  }

  /** Cierre que no pedimos: si ya estábamos dentro, reconectamos; si no, lo decide el bucle de intentos. */
  private onConnClosed(conn: Conn): void {
    if (conn !== this.conn) return
    this.conn = null
    this.stopPing()
    if (this.stopped) return
    if (this.pendingWelcome) {
      this.settleWelcome('retry')
      return
    }
    this.startReconnect()
  }

  private startReconnect(): void {
    this.reconnectDeadline = this.now() + RECONNECT_WINDOW_MS
    this.reconnectAttempt = 0
    this.setSnap({ status: 'reconnecting' })
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)]
    this.reconnectAttempt += 1
    void this.sleep(delay).then(() => this.reconnectOnce())
  }

  private async reconnectOnce(): Promise<void> {
    if (this.stopped) return
    if (this.now() > this.reconnectDeadline) {
      this.giveUp()
      return
    }
    const outcome = await this.attempt('reconnect')
    if (outcome !== 'retry' || this.stopped) return
    if (this.now() > this.reconnectDeadline) this.giveUp()
    else this.scheduleReconnect()
  }

  private giveUp(): void {
    this.terminate('error', { code: 'reconnect-failed', message: 'No se pudo reconectar con la mesa' }, 'fatal')
  }

  private removePageHide(): void {
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide)
  }

  /** Fin de la sesión con un estado terminal; no se vuelve a reconectar. */
  private terminate(
    status: ConnectionStatus,
    lastError?: Omit<SnapshotError, 'at'>,
    outcome: AttemptOutcome = 'terminal',
  ): void {
    if (this.stopped) return
    this.stopped = true
    this.removePageHide()
    this.clearSleep()
    this.detachConn(true)
    this.setSnap(lastError ? { status, lastError: { ...lastError, at: this.now() } } : { status })
    this.settleWelcome(outcome)
  }

  // ---------------------------------------------------------------------------
  // Latidos
  // ---------------------------------------------------------------------------

  private startPing(): void {
    this.stopPing()
    this.unansweredPingAt = null
    this.pingTimer = setInterval(() => {
      const conn = this.conn
      if (!conn) return
      // Solo cuenta un ping sin respuesta: en una pestaña oculta este intervalo puede retrasarse
      // ~60 s, y ese silencio no significa que el host haya caído.
      const now = this.now()
      if (this.unansweredPingAt !== null && this.lastActivity >= this.unansweredPingAt) {
        this.unansweredPingAt = null
      }
      if (this.unansweredPingAt !== null && now - this.unansweredPingAt > LIVENESS_TIMEOUT_MS) {
        this.stopPing()
        conn.close()
        this.onConnClosed(conn)
        return
      }
      if (this.unansweredPingAt === null) this.unansweredPingAt = now
      this.send({ t: 'ping' })
    }, PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  private send(msg: ClientMessage): void {
    try {
      this.conn?.send(msg)
    } catch {
      /* el cierre llegará por onClose */
    }
  }

  /** Espera cancelable: `clearSleep()` la resuelve de inmediato (p. ej. al salir). */
  private sleep(ms: number): Promise<void> {
    this.clearSleep()
    return new Promise<void>((resolve) => {
      this.sleepResolve = resolve
      this.sleepTimer = setTimeout(() => {
        this.sleepTimer = null
        this.sleepResolve = null
        resolve()
      }, ms)
    })
  }

  private clearSleep(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer)
      this.sleepTimer = null
    }
    const resolve = this.sleepResolve
    this.sleepResolve = null
    resolve?.()
  }

  private emitEvents(events: Parameters<EventListener>[0], state: TableState): void {
    if (events.length === 0) return
    for (const listener of [...this.eventListeners]) {
      try {
        listener(events, state)
      } catch (err) {
        console.error('[client] listener de eventos falló', err)
      }
    }
    this.bus.emit(events, state)
  }

  private setSnap(patch: Partial<SessionSnapshot>): void {
    let changed = false
    for (const key of Object.keys(patch) as Array<keyof SessionSnapshot>) {
      if (patch[key] !== this.snap[key]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.snap = { ...this.snap, ...patch }
    for (const listener of [...this.snapListeners]) {
      try {
        listener(this.snap)
      } catch (err) {
        console.error('[client] listener de snapshot falló', err)
      }
    }
  }
}
