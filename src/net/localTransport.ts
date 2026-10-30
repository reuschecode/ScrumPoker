/**
 * Transporte 'local': BroadcastChannel entre pestañas del mismo navegador (sin red).
 *
 * Todos los extremos de una mesa comparten el canal `sp:<CODE>`. Cada extremo tiene un id
 * aleatorio y los sobres llevan `from`/`to` para enrutar dentro del canal compartido:
 *   probe → alive   (¿hay ya un host para este código?)
 *   connect → accept (apertura de una conexión lógica cliente ↔ host)
 *   data / close     (tráfico y cierre de esa conexión)
 */
import { newId } from '@/lib/ids'
import type { ClientTransport, Conn, HostTransport } from '@/net/protocol'
import { TransportError } from '@/net/protocol'

type EnvelopeKind = 'probe' | 'alive' | 'connect' | 'accept' | 'data' | 'close'

interface Envelope {
  kind: EnvelopeKind
  from: string
  to?: string
  payload?: unknown
}

type Post = (env: Envelope) => void

const PROBE_WAIT_MS = 400
const CONNECT_TIMEOUT_MS = 1500
const KINDS: ReadonlySet<string> = new Set<EnvelopeKind>(['probe', 'alive', 'connect', 'accept', 'data', 'close'])

function channelName(code: string): string {
  return `sp:${code}`
}

function isEnvelope(x: unknown): x is Envelope {
  if (!x || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  return (
    typeof e.kind === 'string' &&
    KINDS.has(e.kind) &&
    typeof e.from === 'string' &&
    (e.to === undefined || typeof e.to === 'string')
  )
}

function ensureSupported(): void {
  if (typeof BroadcastChannel === 'undefined') {
    throw new TransportError('unsupported', 'Este navegador no soporta BroadcastChannel')
  }
}

function poster(channel: BroadcastChannel): Post {
  return (env) => {
    try {
      channel.postMessage(env)
    } catch {
      /* canal ya cerrado */
    }
  }
}

/**
 * Conexión lógica sobre el canal compartido. `close()` avisa al otro extremo y dispara el
 * onClose local una sola vez, igual que un cierre remoto: "cerrada es cerrada".
 */
class ChannelConn implements Conn {
  private readonly messageCbs = new Set<(msg: unknown) => void>()
  private readonly closeCbs = new Set<(reason?: string) => void>()
  private closed = false

  constructor(
    readonly id: string,
    private readonly post: Post,
    private readonly selfId: string,
    private readonly remoteId: string,
    private readonly onFinished: () => void,
  ) {}

  send(msg: unknown): void {
    if (this.closed) return
    this.post({ kind: 'data', from: this.selfId, to: this.remoteId, payload: msg })
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
    this.post({ kind: 'close', from: this.selfId, to: this.remoteId })
    this.finish('closed')
  }

  /** Entrega un mensaje recibido del otro extremo. */
  deliver(msg: unknown): void {
    if (this.closed) return
    for (const cb of [...this.messageCbs]) cb(msg)
  }

  /** Marca la conexión como cerrada y notifica una sola vez (cierre local o remoto). */
  finish(reason?: string): void {
    if (this.closed) return
    this.closed = true
    this.onFinished()
    const cbs = [...this.closeCbs]
    this.messageCbs.clear()
    this.closeCbs.clear()
    for (const cb of cbs) cb(reason)
  }
}

export class LocalHostTransport implements HostTransport {
  private readonly id = newId()
  private readonly conns = new Map<string, ChannelConn>()
  private channel: BroadcastChannel | null = null
  private active = false
  private onPagehide: (() => void) | null = null

  async listen(code: string, onConnection: (conn: Conn) => void): Promise<void> {
    ensureSupported()
    if (this.channel) throw new Error('listen() ya fue llamado')
    const channel = new BroadcastChannel(channelName(code))
    this.channel = channel
    const post = poster(channel)

    // Sondeo: si otro host responde 'alive', el código está ocupado.
    const taken = await new Promise<boolean>((resolve) => {
      const onProbeReply = (ev: MessageEvent) => {
        const env: unknown = ev.data
        if (isEnvelope(env) && env.kind === 'alive' && env.to === this.id) {
          clearTimeout(timer)
          channel.removeEventListener('message', onProbeReply)
          resolve(true)
        }
      }
      const timer = setTimeout(() => {
        channel.removeEventListener('message', onProbeReply)
        resolve(false)
      }, PROBE_WAIT_MS)
      channel.addEventListener('message', onProbeReply)
      post({ kind: 'probe', from: this.id })
    })
    if (taken) {
      channel.close()
      this.channel = null
      throw new TransportError('code-taken', 'Ya hay una mesa activa con este código')
    }

    this.active = true
    channel.addEventListener('message', (ev: MessageEvent) => {
      const env: unknown = ev.data
      if (!this.active || !isEnvelope(env)) return
      switch (env.kind) {
        case 'probe':
          post({ kind: 'alive', from: this.id, to: env.from })
          break
        case 'connect': {
          this.conns.get(env.from)?.finish('replaced')
          const conn = new ChannelConn(env.from, post, this.id, env.from, () => {
            if (this.conns.get(env.from) === conn) this.conns.delete(env.from)
          })
          this.conns.set(env.from, conn)
          onConnection(conn)
          post({ kind: 'accept', from: this.id, to: env.from })
          break
        }
        case 'data':
          if (env.to === this.id) this.conns.get(env.from)?.deliver(env.payload)
          break
        case 'close':
          if (env.to === undefined || env.to === this.id) this.conns.get(env.from)?.finish('remote')
          break
        default:
          break
      }
    })

    if (typeof window !== 'undefined') {
      this.onPagehide = () => {
        for (const conn of this.conns.values()) post({ kind: 'close', from: this.id, to: conn.id })
      }
      window.addEventListener('pagehide', this.onPagehide)
    }
  }

  close(): void {
    this.active = false
    for (const conn of [...this.conns.values()]) conn.close()
    this.conns.clear()
    if (this.onPagehide && typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPagehide)
    this.onPagehide = null
    this.channel?.close()
    this.channel = null
  }
}

export class LocalClientTransport implements ClientTransport {
  async connect(code: string): Promise<Conn> {
    ensureSupported()
    const channel = new BroadcastChannel(channelName(code))
    const id = newId()
    const post = poster(channel)

    const hostId = await new Promise<string | null>((resolve) => {
      const onAccept = (ev: MessageEvent) => {
        const env: unknown = ev.data
        if (isEnvelope(env) && env.kind === 'accept' && env.to === id) {
          clearTimeout(timer)
          channel.removeEventListener('message', onAccept)
          resolve(env.from)
        }
      }
      const timer = setTimeout(() => {
        channel.removeEventListener('message', onAccept)
        resolve(null)
      }, CONNECT_TIMEOUT_MS)
      channel.addEventListener('message', onAccept)
      post({ kind: 'connect', from: id })
    })
    if (!hostId) {
      channel.close()
      throw new TransportError('not-found', 'No hay un anfitrión conectado para este código')
    }

    const onPagehide = () => post({ kind: 'close', from: id, to: hostId })
    const onMessage = (ev: MessageEvent) => {
      const env: unknown = ev.data
      if (!isEnvelope(env) || env.from !== hostId) return
      if (env.kind === 'data' && env.to === id) conn.deliver(env.payload)
      else if (env.kind === 'close' && (env.to === undefined || env.to === id)) conn.finish('remote')
    }
    const conn = new ChannelConn(hostId, post, id, hostId, () => {
      channel.removeEventListener('message', onMessage)
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPagehide)
      channel.close()
    })
    channel.addEventListener('message', onMessage)
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onPagehide)
    return conn
  }
}
