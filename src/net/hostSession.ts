/**
 * Sesión del host: mantiene el estado autoritativo, aplica comandos con el reducer y difunde
 * a cada cliente su proyección (`projectStateFor`) junto con los eventos producidos.
 *
 * Ciclo de una conexión: hello (autenticación por id+secreto) → welcome → cmd/ping/bye.
 * Si la última conexión de un usuario se cae, se marca DISCONNECT y, pasada la gracia, LEAVE.
 */
import type {
  Action,
  Command,
  DomainEvent,
  ReduceResult,
  SystemCommand,
  TableState,
  UserAction,
  UserId,
} from '@/domain/types'
import { DISCONNECT_GRACE_MS } from '@/domain/types'
import { reduce } from '@/domain/reducer'
import { isValidUserId, sanitizeName } from '@/domain/table'
import { projectStateFor } from '@/domain/projection'
import type {
  ClientMessage,
  Conn,
  HostMessage,
  HostTransport,
  Identity,
  RejectReason,
  Session,
  SessionSnapshot,
} from '@/net/protocol'
import { PROTOCOL_VERSION, TransportError, isClientMessage } from '@/net/protocol'
import { removeHostTable, saveHostTable } from '@/net/hostStorage'
import { eventBus } from '@/store/eventBus'
import type { EventBus, EventListener } from '@/store/types'

export interface HostResume {
  state: TableState
  secrets: Record<UserId, string>
}

export interface HostSessionOptions {
  code: string
  identity: Identity
  transport: HostTransport
  /** Estado inicial de una mesa nueva, o el estado persistido para retomarla tras un refresh. */
  initial: TableState | { resume: HostResume }
  /** Bus al que se publican los eventos (por defecto el global; inyectable en tests). */
  bus?: EventBus
  /** Reloj (inyectable en tests). */
  now?: () => number
}

const HELLO_TIMEOUT_MS = 10_000
const WATCHDOG_INTERVAL_MS = 5_000
// Holgado a propósito: el navegador limita los temporizadores de una pestaña oculta hasta una vez
// por minuto, así que un cliente vivo puede tardar ~60 s en enviar su ping.
const CONN_IDLE_TIMEOUT_MS = 90_000
const PERSIST_THROTTLE_MS = 150
/** Margen para que el aviso 'closed' llegue antes de cortar las conexiones. */
const CLOSE_FLUSH_MS = 300
const DEFAULT_NAME = 'Invitado'
const MAX_SECRET_LENGTH = 128
/** Tope de secretos guardados; al superarlo se olvidan los de los ausentes más antiguos. */
const MAX_STORED_SECRETS = 200
// Muy por encima del uso normal, incluidas las ráfagas de quien pulsa cartas o reacciones sin parar.
const CMD_RATE_PER_SECOND = 10
const CMD_BURST = 20
/** Comandos descartados sin que el cubo llegue a llenarse tras los que se corta la conexión. */
const CMD_ABUSE_LIMIT = 100
/** Tipos que un cliente puede enviar. JOIN, DISCONNECT y LEAVE solo los genera el host. */
const CLIENT_COMMAND_TYPES: Record<Command['type'], true> = {
  SET_NAME: true,
  SET_TABLE_NAME: true,
  SET_DECK: true,
  SET_STORY: true,
  VOTE: true,
  CLEAR_VOTE: true,
  REVEAL: true,
  RESET_ROUND: true,
  FINISH_ROUND: true,
  KICK: true,
  GRANT_ADMIN: true,
  REVOKE_ADMIN: true,
  CHAT: true,
  REACT: true,
  CLOSE_TABLE: true,
}

type HelloMessage = Extract<ClientMessage, { t: 'hello' }>
type CmdMessage = Extract<ClientMessage, { t: 'cmd' }>

interface ConnEntry {
  conn: Conn
  /** null hasta recibir un 'hello' válido. */
  userId: UserId | null
  lastSeen: number
  helloTimer: ReturnType<typeof setTimeout> | null
  unsubscribe: () => void
  /** Cubo de fichas de los 'cmd'. Ping, hello y bye no pasan por él: no deben perderse. */
  cmdTokens: number
  cmdTokensAt: number
  cmdDropped: number
}

function rejectReasonFor(code: string): RejectReason {
  switch (code) {
    case 'kicked':
      return 'kicked'
    case 'table-full':
      return 'full'
    case 'table-closed':
      return 'closed'
    default:
      return 'protocol'
  }
}

export class HostSession implements Session {
  readonly role = 'host' as const
  readonly code: string

  private readonly identity: Identity
  private readonly transport: HostTransport
  private readonly bus: EventBus
  private readonly now: () => number
  private readonly resumed: boolean

  private state: TableState
  private readonly secrets = new Map<UserId, string>()
  private readonly conns = new Map<Conn, ConnEntry>()
  private readonly graceTimers = new Map<UserId, ReturnType<typeof setTimeout>>()

  private snap: SessionSnapshot
  private readonly snapListeners = new Set<(snap: SessionSnapshot) => void>()
  private readonly eventListeners = new Set<EventListener>()

  private watchdog: ReturnType<typeof setInterval> | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private onPagehide: (() => void) | null = null
  private started = false
  private persistFailed = false
  /** true tras cerrar la mesa o salir: no se aplican más acciones. */
  private finished = false

  constructor(opts: HostSessionOptions) {
    this.code = opts.code
    this.identity = opts.identity
    this.transport = opts.transport
    this.bus = opts.bus ?? eventBus
    this.now = opts.now ?? (() => Date.now())
    if ('resume' in opts.initial) {
      this.state = opts.initial.resume.state
      for (const [id, secret] of Object.entries(opts.initial.resume.secrets)) {
        if (secret.length <= MAX_SECRET_LENGTH) this.secrets.set(id, secret)
      }
      this.resumed = true
    } else {
      this.state = opts.initial
      this.resumed = false
    }
    this.secrets.set(this.identity.id, this.identity.secret)
    this.pruneSecrets()
    this.snap = {
      role: 'host',
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

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.setSnap({ status: 'connecting', lastError: null })
    try {
      await this.transport.listen(this.code, (conn) => this.onConnection(conn))
    } catch (err) {
      this.finished = true
      const message =
        err instanceof TransportError ? err.message : 'No se pudo abrir la mesa'
      // Con el código ocupado, decide quien llamó (reintentar o entrar como cliente): no es un error
      // que el usuario deba ver.
      if (!(err instanceof TransportError && err.code === 'code-taken')) {
        this.setSnap({
          status: 'error',
          lastError: { code: err instanceof TransportError ? err.code : 'transport', message, at: this.now() },
        })
      }
      throw err
    }
    if (this.finished) {
      // leave() llegó mientras abríamos el transporte (p. ej. StrictMode): no arrancamos nada.
      try {
        this.transport.close()
      } catch {
        /* ya cerrado */
      }
      return
    }

    try {
      // El host entra (o vuelve a entrar) a su propia mesa; sin sonidos ni difusión: aún no hay nadie.
      this.applySystem({ type: 'JOIN', user: { id: this.identity.id, name: this.identity.name || DEFAULT_NAME } }, true)
      if (this.resumed) {
        // Nadie sigue conectado tras un refresh: todos pasan a gracia hasta que reconecten.
        for (const p of this.state.participants) {
          if (p.id === this.identity.id) continue
          if (p.connected) this.applySystem({ type: 'DISCONNECT', userId: p.id }, true)
          this.startGrace(p.id)
        }
      }

      this.watchdog = setInterval(() => this.checkLiveness(), WATCHDOG_INTERVAL_MS)
      if (typeof window !== 'undefined') {
        this.onPagehide = () => this.persistNow()
        window.addEventListener('pagehide', this.onPagehide)
      }
      this.persistNow()
      this.setSnap({ status: 'connected', state: this.project(this.identity.id) })
    } catch (err) {
      // Con el transporte ya abierto: sin liberarlo, el código quedaría ocupado por una mesa zombi.
      console.error('[host] no se pudo arrancar la mesa', err)
      this.teardown()
      this.setSnap({
        status: 'error',
        lastError: { code: 'unexpected', message: 'No se pudo abrir la mesa', at: this.now() },
      })
      throw err
    }
  }

  dispatch(cmd: Command): void {
    if (this.finished) {
      this.setSnap({ lastError: { code: 'offline', message: 'La mesa ya no está activa', at: this.now() } })
      return
    }
    const result = this.apply({ ...cmd, by: this.identity.id, at: this.now() })
    if (result.error && result.error.code !== 'noop') {
      this.setSnap({ lastError: { code: result.error.code, message: result.error.message, at: this.now() } })
    }
  }

  /** Suspende la mesa: se persiste y deja de escuchar; se retoma con joinTable al mismo código. */
  leave(): void {
    if (this.finished) return
    this.persistNow()
    this.teardown()
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

  /** Estado real (sin proyectar). Útil para depuración y pruebas. */
  getAuthoritativeState(): TableState {
    return this.state
  }

  // ---------------------------------------------------------------------------
  // Conexiones
  // ---------------------------------------------------------------------------

  private onConnection(conn: Conn): void {
    if (this.finished) {
      conn.close()
      return
    }
    const entry: ConnEntry = {
      conn,
      userId: null,
      lastSeen: this.now(),
      helloTimer: null,
      unsubscribe: () => {},
      cmdTokens: CMD_BURST,
      cmdTokensAt: this.now(),
      cmdDropped: 0,
    }
    const offMessage = conn.onMessage((msg) => this.onMessage(entry, msg))
    const offClose = conn.onClose(() => this.onConnClosed(entry))
    entry.unsubscribe = () => {
      offMessage()
      offClose()
    }
    entry.helloTimer = setTimeout(() => {
      if (entry.userId === null) this.dropConn(entry)
    }, HELLO_TIMEOUT_MS)
    this.conns.set(conn, entry)
  }

  private onMessage(entry: ConnEntry, raw: unknown): void {
    if (this.finished || !isClientMessage(raw)) return
    entry.lastSeen = this.now()
    switch (raw.t) {
      case 'hello':
        this.onHello(entry, raw)
        break
      case 'cmd':
        this.onCmd(entry, raw)
        break
      case 'ping':
        this.send(entry.conn, { t: 'pong' })
        break
      case 'bye':
        this.onBye(entry)
        break
      default:
        break
    }
  }

  private onHello(entry: ConnEntry, msg: HelloMessage): void {
    if (entry.userId !== null) return // ya autenticada
    const reject = (reason: RejectReason) => {
      this.send(entry.conn, { t: 'rejected', reason })
      this.dropConn(entry)
    }
    if (
      msg.proto !== PROTOCOL_VERSION ||
      !isValidUserId(msg.id) ||
      typeof msg.secret !== 'string' ||
      !msg.secret ||
      msg.secret.length > MAX_SECRET_LENGTH ||
      typeof msg.name !== 'string'
    ) {
      reject('protocol')
      return
    }
    const known = this.secrets.get(msg.id)
    if (known !== undefined && known !== msg.secret) {
      reject('bad-secret')
      return
    }
    if (this.state.closed) {
      reject('closed')
      return
    }

    const name = sanitizeName(msg.name) || DEFAULT_NAME
    // La conexión aún no tiene userId, así que la difusión del JOIN no la incluye: recibe 'welcome'.
    const result = this.apply({ type: 'JOIN', user: { id: msg.id, name }, at: this.now() })
    if (result.error && result.error.code !== 'noop') {
      reject(rejectReasonFor(result.error.code))
      return
    }

    // Se reinserta para que el Map quede ordenado del uso más antiguo al más reciente.
    this.secrets.delete(msg.id)
    this.secrets.set(msg.id, msg.secret)
    this.pruneSecrets()
    entry.userId = msg.id
    if (entry.helloTimer) {
      clearTimeout(entry.helloTimer)
      entry.helloTimer = null
    }
    this.cancelGrace(msg.id)
    this.persistSoon() // el secreto puede ser nuevo aunque el estado no cambie
    this.send(entry.conn, { t: 'welcome', you: msg.id, state: this.project(msg.id) })
  }

  private onCmd(entry: ConnEntry, msg: CmdMessage): void {
    if (entry.userId === null) {
      this.send(entry.conn, { t: 'rejected', reason: 'protocol' })
      this.dropConn(entry)
      return
    }
    if (!this.takeCmdToken(entry)) {
      if (entry.cmdDropped === 1) {
        this.send(entry.conn, {
          t: 'error',
          seq: msg.seq,
          code: 'rate-limited',
          message: 'Vas demasiado rápido. Espera un momento',
        })
      } else if (entry.cmdDropped >= CMD_ABUSE_LIMIT) {
        entry.conn.close()
        this.onConnClosed(entry) // por si el transporte no notifica cierres locales
      }
      return
    }
    const cmd: unknown = msg.cmd
    const type: unknown = cmd && typeof cmd === 'object' ? (cmd as { type?: unknown }).type : undefined
    if (typeof type !== 'string' || !Object.hasOwn(CLIENT_COMMAND_TYPES, type)) {
      this.send(entry.conn, { t: 'error', seq: msg.seq, code: 'invalid-command', message: 'Comando inválido' })
      return
    }
    const action: UserAction = { ...msg.cmd, by: entry.userId, at: this.now() }
    const result = this.apply(action)
    if (result.error && result.error.code !== 'noop') {
      this.send(entry.conn, { t: 'error', seq: msg.seq, code: result.error.code, message: result.error.message })
    }
  }

  /** Consume una ficha si hay; si no, cuenta el descarte. El contador vuelve a 0 con el cubo lleno. */
  private takeCmdToken(entry: ConnEntry): boolean {
    const now = this.now()
    const refill = (Math.max(0, now - entry.cmdTokensAt) / 1000) * CMD_RATE_PER_SECOND
    entry.cmdTokens = Math.min(CMD_BURST, entry.cmdTokens + refill)
    entry.cmdTokensAt = now
    if (entry.cmdTokens === CMD_BURST) entry.cmdDropped = 0
    if (entry.cmdTokens >= 1) {
      entry.cmdTokens -= 1
      return true
    }
    entry.cmdDropped += 1
    return false
  }

  private onBye(entry: ConnEntry): void {
    const userId = entry.userId
    this.removeEntry(entry)
    entry.conn.close()
    if (!userId || userId === this.identity.id || this.hasConns(userId)) return
    this.cancelGrace(userId)
    this.applySystem({ type: 'LEAVE', userId })
  }

  /** Cierre (remoto o local) de una conexión que aún estaba registrada. */
  private onConnClosed(entry: ConnEntry): void {
    if (!this.conns.has(entry.conn)) return // ya retirada por bye/drop
    this.removeEntry(entry)
    const userId = entry.userId
    if (this.finished || !userId || userId === this.identity.id || this.hasConns(userId)) return
    this.applySystem({ type: 'DISCONNECT', userId })
    this.startGrace(userId)
  }

  private removeEntry(entry: ConnEntry): void {
    entry.unsubscribe()
    if (entry.helloTimer) {
      clearTimeout(entry.helloTimer)
      entry.helloTimer = null
    }
    this.conns.delete(entry.conn)
  }

  private dropConn(entry: ConnEntry): void {
    this.removeEntry(entry)
    entry.conn.close()
  }

  /** Olvida los secretos de ausentes más antiguos; los de quienes están en la mesa no se tocan. */
  private pruneSecrets(): void {
    for (const id of this.secrets.keys()) {
      if (this.secrets.size <= MAX_STORED_SECRETS) return
      if (id !== this.identity.id && !this.state.participants.some((p) => p.id === id)) this.secrets.delete(id)
    }
  }

  private hasConns(userId: UserId): boolean {
    for (const entry of this.conns.values()) if (entry.userId === userId) return true
    return false
  }

  private connsOf(userId: UserId): ConnEntry[] {
    const out: ConnEntry[] = []
    for (const entry of this.conns.values()) if (entry.userId === userId) out.push(entry)
    return out
  }

  private checkLiveness(): void {
    const now = this.now()
    for (const entry of [...this.conns.values()]) {
      if (now - entry.lastSeen <= CONN_IDLE_TIMEOUT_MS) continue
      entry.conn.close()
      this.onConnClosed(entry) // por si el transporte no notifica cierres locales
    }
  }

  private startGrace(userId: UserId): void {
    this.cancelGrace(userId)
    const timer = setTimeout(() => {
      this.graceTimers.delete(userId)
      if (this.finished || this.hasConns(userId)) return
      this.applySystem({ type: 'LEAVE', userId })
    }, DISCONNECT_GRACE_MS)
    this.graceTimers.set(userId, timer)
  }

  private cancelGrace(userId: UserId): void {
    const timer = this.graceTimers.get(userId)
    if (timer === undefined) return
    clearTimeout(timer)
    this.graceTimers.delete(userId)
  }

  // ---------------------------------------------------------------------------
  // Reducer, difusión y persistencia
  // ---------------------------------------------------------------------------

  private applySystem(cmd: SystemCommand, silent = false): ReduceResult {
    return this.apply({ ...cmd, at: this.now() }, silent)
  }

  /**
   * Aplica una acción. Si cambió el estado (y no es `silent`): persiste, difunde la proyección a
   * cada cliente, actualiza el snapshot del host y emite los eventos.
   */
  private apply(action: Action, silent = false): ReduceResult {
    let result: ReduceResult
    try {
      result = reduce(this.state, action)
    } catch (err) {
      console.error('[host] el reducer lanzó', err)
      result = { state: this.state, events: [], error: { code: 'noop', message: 'Acción inválida' } }
    }
    if (result.error || result.state === this.state) return result
    const prev = this.state
    this.state = result.state
    if (!silent) this.afterChange(prev, result.events)
    return result
  }

  private afterChange(prev: TableState, events: DomainEvent[]): void {
    this.persistSoon()
    this.broadcast(events)
    const mine = this.project(this.identity.id)
    this.setSnap({ state: mine })
    this.emitEvents(events, mine)

    // Un expulsado recibe el estado (para su toast/sonido) y luego el rechazo explícito.
    for (const ev of events) {
      if (ev.type !== 'participant.kicked') continue
      this.cancelGrace(ev.userId)
      for (const entry of this.connsOf(ev.userId)) {
        this.send(entry.conn, { t: 'rejected', reason: 'kicked' })
        this.dropConn(entry)
      }
    }
    if (this.state.closed && !prev.closed) this.closeTable()
  }

  private broadcast(events: DomainEvent[]): void {
    const cache = new Map<UserId, TableState>()
    for (const entry of this.conns.values()) {
      if (entry.userId === null) continue
      let projected = cache.get(entry.userId)
      if (!projected) {
        projected = this.project(entry.userId)
        cache.set(entry.userId, projected)
      }
      this.send(entry.conn, { t: 'state', state: projected, events })
    }
  }

  private project(viewerId: UserId): TableState {
    return projectStateFor(this.state, viewerId)
  }

  private send(conn: Conn, msg: HostMessage): void {
    try {
      conn.send(msg)
    } catch {
      /* conexión caída: el cierre llega por onClose */
    }
  }

  private emitEvents(events: DomainEvent[], state: TableState): void {
    if (events.length === 0) return
    for (const listener of [...this.eventListeners]) {
      try {
        listener(events, state)
      } catch (err) {
        console.error('[host] listener de eventos falló', err)
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
        console.error('[host] listener de snapshot falló', err)
      }
    }
  }

  private persistSoon(): void {
    if (this.finished || this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistNow()
    }, PERSIST_THROTTLE_MS)
  }

  private persistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    if (this.finished) return
    const saved = saveHostTable(this.code, { state: this.state, secrets: this.secrets })
    // Se avisa una vez por tanda de fallos: se reintenta con cada cambio.
    if (!saved && !this.persistFailed) {
      this.setSnap({
        lastError: {
          code: 'persist-failed',
          message: 'No se pudo guardar la mesa en este navegador. Si recargas, puedes perder los últimos cambios',
          at: this.now(),
        },
      })
    }
    this.persistFailed = !saved
  }

  /** CLOSE_TABLE aplicado: avisa a todos, corta conexiones y transporte y borra la persistencia. */
  private closeTable(): void {
    for (const entry of this.conns.values()) this.send(entry.conn, { t: 'closed' })
    this.finished = true
    this.clearTimers()
    removeHostTable(this.code)
    this.setSnap({ status: 'closed' })
    setTimeout(() => this.teardown(), CLOSE_FLUSH_MS)
  }

  private clearTimers(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = null
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    for (const timer of this.graceTimers.values()) clearTimeout(timer)
    this.graceTimers.clear()
    if (this.onPagehide && typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPagehide)
    this.onPagehide = null
  }

  private teardown(): void {
    this.finished = true
    this.clearTimers()
    for (const entry of [...this.conns.values()]) this.dropConn(entry)
    this.conns.clear()
    try {
      this.transport.close()
    } catch (err) {
      console.error('[host] error al cerrar el transporte', err)
    }
  }
}
