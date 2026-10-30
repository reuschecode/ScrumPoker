/**
 * CONTRATO DE RED — protocolo host ↔ cliente y abstracción de transporte.
 *
 * Topología: estrella. Cada cliente mantiene UNA conexión con el host. El host
 * nunca reenvía mensajes crudos: aplica comandos con el reducer y difunde
 * snapshots proyectados (`projectStateFor`) + eventos.
 *
 * Hay dos transportes intercambiables (ver `transports.ts`):
 *  - 'local': BroadcastChannel (pestañas del mismo navegador; sin red).
 *  - 'peer':  WebRTC vía PeerJS (dispositivos distintos; sin backend propio).
 */

import type { Command, DomainEvent, TableState, UserId } from '@/domain/types'

export const PROTOCOL_VERSION = 1

/** Identidad local persistida en localStorage (ver store/identity.ts). */
export interface Identity {
  id: UserId
  /** Secreto aleatorio que el host asocia al id en el primer JOIN; evita suplantaciones. */
  secret: string
  name: string
}

export type ClientMessage =
  | { t: 'hello'; proto: number; id: UserId; secret: string; name: string }
  | { t: 'cmd'; seq: number; cmd: Command }
  | { t: 'ping' }
  | { t: 'bye' }

export type RejectReason = 'kicked' | 'closed' | 'full' | 'bad-secret' | 'protocol'

export type HostMessage =
  | { t: 'welcome'; you: UserId; state: TableState }
  | { t: 'state'; state: TableState; events: DomainEvent[] }
  | { t: 'rejected'; reason: RejectReason }
  | { t: 'error'; seq: number; code: string; message: string }
  | { t: 'closed' }
  | { t: 'pong' }

/** Mensaje tolerante a datos basura: el receptor valida la forma antes de actuar. */
export function isClientMessage(x: unknown): x is ClientMessage {
  return !!x && typeof x === 'object' && typeof (x as { t?: unknown }).t === 'string'
}
export function isHostMessage(x: unknown): x is HostMessage {
  return !!x && typeof x === 'object' && typeof (x as { t?: unknown }).t === 'string'
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

export type TransportKind = 'local' | 'peer'

export type TransportErrorCode = 'code-taken' | 'not-found' | 'network' | 'unsupported' | 'timeout'

export class TransportError extends Error {
  constructor(
    public readonly code: TransportErrorCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'TransportError'
  }
}

/** Una conexión bidireccional punto a punto, ya abierta. */
export interface Conn {
  readonly id: string
  send(msg: unknown): void
  /** Devuelve una función para desuscribirse. */
  onMessage(cb: (msg: unknown) => void): () => void
  onClose(cb: (reason?: string) => void): () => void
  close(): void
}

export interface HostTransport {
  /**
   * Registra esta pestaña como host de `code` y empieza a aceptar conexiones.
   * Rechaza con TransportError('code-taken') si ya existe un host para ese código.
   */
  listen(code: string, onConnection: (conn: Conn) => void): Promise<void>
  /** Cierra todas las conexiones y deja de escuchar. */
  close(): void
}

export interface ClientTransport {
  /**
   * Abre una conexión con el host de `code`.
   * Rechaza con TransportError('not-found' | 'network' | 'timeout').
   */
  connect(code: string): Promise<Conn>
}

// ---------------------------------------------------------------------------
// Sesión (lo que consume la UI a través del store)
// ---------------------------------------------------------------------------

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'not-found' // no existe host para ese código
  | 'kicked' // fuimos expulsados
  | 'closed' // la mesa fue cerrada
  | 'error' // fallo de transporte irrecuperable

export interface SessionSnapshot {
  role: 'host' | 'client'
  code: string
  status: ConnectionStatus
  /** Proyección del estado para este usuario; null hasta recibir 'welcome'. */
  state: TableState | null
  me: UserId
  /** Último error (de dominio o transporte) para mostrar en un toast. */
  lastError: { code: string; message: string; at: number } | null
}

export interface Session {
  readonly role: 'host' | 'client'
  readonly code: string
  /** Conecta (cliente) o empieza a escuchar (host). Resuelve cuando hay estado. */
  start(): Promise<void>
  /** Envía un comando (cliente) o lo aplica directamente (host). */
  dispatch(cmd: Command): void
  /** Sale de la mesa de forma ordenada. El host NO cierra la mesa al salir: usa CLOSE_TABLE. */
  leave(): void
  getSnapshot(): SessionSnapshot
  subscribe(listener: (snap: SessionSnapshot) => void): () => void
  /** Eventos de dominio producidos por cada actualización (para sonidos/toasts/animaciones). */
  onEvents(listener: (events: DomainEvent[], state: TableState) => void): () => void
}
