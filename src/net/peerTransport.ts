/**
 * Transporte 'peer': WebRTC vía PeerJS (dispositivos distintos, sin backend propio).
 * El host se registra en el servidor de señalización con el id `scrumpoker-<CODE>`;
 * los clientes abren un DataConnection fiable contra ese id. La serialización es 'binary' porque
 * trocea los mensajes grandes; 'json' descarta los de 16300 bytes o más, y el estado los alcanza.
 */
import Peer, { type DataConnection } from 'peerjs'
import type { ClientTransport, Conn, HostTransport, TransportErrorCode } from '@/net/protocol'
import { TransportError } from '@/net/protocol'

const PEER_ID_PREFIX = 'scrumpoker-'
const OPEN_TIMEOUT_MS = 10_000
/** Margen para que los últimos mensajes salgan antes de cerrar el canal de datos. */
const FLUSH_CLOSE_MS = 400
const RECONNECT_MAX_DELAY_MS = 10_000
export const CONNECT_OPTIONS = { reliable: true, serialization: 'binary' } as const

export function peerIdFor(code: string): string {
  return `${PEER_ID_PREFIX}${code}`
}

function ensureSupported(): void {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new TransportError('unsupported', 'Este navegador no soporta WebRTC')
  }
}

function mapPeerError(type: string, side: 'host' | 'client'): TransportErrorCode {
  if (side === 'host' && type === 'unavailable-id') return 'code-taken'
  if (side === 'client' && type === 'peer-unavailable') return 'not-found'
  if (type === 'browser-incompatible') return 'unsupported'
  return 'network'
}

function describe(code: TransportErrorCode, detail: string): string {
  switch (code) {
    case 'code-taken':
      return 'Ya hay una mesa activa con este código'
    case 'not-found':
      return 'No hay un anfitrión conectado para este código'
    case 'unsupported':
      return 'Este navegador no soporta WebRTC'
    case 'timeout':
      return 'La conexión tardó demasiado'
    case 'network':
      return detail || 'No se pudo conectar con el servidor de señalización'
  }
}

/** Envoltorio de un DataConnection abierto. Notifica el cierre una sola vez, sea local o remoto. */
export class PeerConn implements Conn {
  readonly id: string
  private readonly messageCbs = new Set<(msg: unknown) => void>()
  private readonly closeCbs = new Set<(reason?: string) => void>()
  private closed = false
  private cleanedUp = false

  constructor(
    private readonly dc: DataConnection,
    private readonly onCleanup: () => void,
  ) {
    this.id = dc.connectionId || dc.peer
    dc.on('data', (data) => {
      if (this.closed) return
      for (const cb of [...this.messageCbs]) cb(data)
    })
    dc.on('close', () => this.finish('remote', true))
    dc.on('error', (err) => this.finish(err.type, true))
    // 'disconnected' es transitorio y ICE puede recuperarse solo: el cierre real llega con 'failed'.
    dc.on('iceStateChanged', (state) => {
      if (state === 'failed' || state === 'closed') this.finish(`ice-${state}`, true)
    })
  }

  send(msg: unknown): void {
    if (this.closed || !this.dc.open) return
    try {
      void this.dc.send(msg)
    } catch {
      /* el cierre llegará por 'close'/'error' */
    }
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
    this.finish('closed', false)
    // `flush: true` deja salir lo ya enviado; si el otro extremo no responde, cierre duro.
    try {
      this.dc.close({ flush: true })
    } catch {
      /* ya cerrado */
    }
    setTimeout(() => {
      try {
        this.dc.close()
      } catch {
        /* ya cerrado */
      }
      this.cleanup()
    }, FLUSH_CLOSE_MS)
  }

  private cleanup(): void {
    if (this.cleanedUp) return
    this.cleanedUp = true
    this.onCleanup()
  }

  private finish(reason: string, cleanupNow: boolean): void {
    if (this.closed) return
    this.closed = true
    const cbs = [...this.closeCbs]
    this.messageCbs.clear()
    this.closeCbs.clear()
    if (cleanupNow) {
      // Sin esto, tras un error el canal seguiría abierto y el otro extremo hablaría con el vacío.
      try {
        this.dc.close()
      } catch {
        /* ya cerrado */
      }
      this.cleanup()
    }
    for (const cb of cbs) cb(reason)
  }
}

export class PeerHostTransport implements HostTransport {
  private peer: Peer | null = null
  private readonly conns = new Set<PeerConn>()
  private closing = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0

  listen(code: string, onConnection: (conn: Conn) => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        ensureSupported()
      } catch (err) {
        reject(err)
        return
      }
      if (this.peer) {
        reject(new Error('listen() ya fue llamado'))
        return
      }
      const peer = new Peer(peerIdFor(code))
      this.peer = peer
      let settled = false
      // Mientras no esté listo, cualquier fallo destruye el peer y rechaza listen().
      let dead = false
      const fail = (codeErr: TransportErrorCode, detail: string) => {
        if (settled) return
        settled = true
        dead = true
        clearTimeout(timer)
        peer.destroy()
        this.peer = null
        reject(new TransportError(codeErr, describe(codeErr, detail)))
      }
      const timer = setTimeout(() => fail('timeout', ''), OPEN_TIMEOUT_MS)

      peer.on('open', () => {
        this.reconnectAttempt = 0
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      })
      peer.on('error', (err) => {
        if (!settled) fail(mapPeerError(err.type, 'host'), err.message)
        // Ya listo: los errores de señalización no cortan las conexiones abiertas; 'disconnected' reintenta.
      })
      peer.on('disconnected', () => {
        if (dead || this.closing) return
        this.scheduleReconnect(peer)
      })
      peer.on('connection', (dc) => {
        dc.on('open', () => {
          if (this.closing) {
            dc.close()
            return
          }
          const conn = new PeerConn(dc, () => this.conns.delete(conn))
          this.conns.add(conn)
          onConnection(conn)
        })
      })
    })
  }

  /** Vuelve a registrarse en el servidor de señalización con backoff; las conexiones abiertas siguen vivas. */
  private scheduleReconnect(peer: Peer): void {
    if (this.reconnectTimer) return
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.closing || peer.destroyed || !peer.disconnected) return
      try {
        peer.reconnect()
      } catch {
        /* peer destruido */
      }
    }, delay)
  }

  close(): void {
    this.closing = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    for (const conn of [...this.conns]) conn.close()
    this.conns.clear()
    const peer = this.peer
    this.peer = null
    if (!peer) return
    // Deja salir los últimos mensajes (p. ej. 'closed') antes de destruir el peer.
    setTimeout(() => peer.destroy(), FLUSH_CLOSE_MS)
  }
}

export class PeerClientTransport implements ClientTransport {
  connect(code: string): Promise<Conn> {
    return new Promise<Conn>((resolve, reject) => {
      try {
        ensureSupported()
      } catch (err) {
        reject(err)
        return
      }
      const peer = new Peer()
      let settled = false
      const fail = (codeErr: TransportErrorCode, detail: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        peer.destroy()
        reject(new TransportError(codeErr, describe(codeErr, detail)))
      }
      const timer = setTimeout(() => fail('timeout', ''), OPEN_TIMEOUT_MS)

      peer.on('open', () => {
        if (settled) return
        const dc = peer.connect(peerIdFor(code), { ...CONNECT_OPTIONS })
        dc.on('open', () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(new PeerConn(dc, () => peer.destroy()))
        })
        dc.on('error', (err) => fail('network', err.message))
        dc.on('close', () => fail('network', 'La conexión se cerró antes de abrirse'))
      })
      peer.on('error', (err) => fail(mapPeerError(err.type, 'client'), err.message))
    })
  }
}
