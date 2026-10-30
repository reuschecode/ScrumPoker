import type { ClientTransport, HostTransport, TransportKind } from '@/net/protocol'
import { LocalClientTransport, LocalHostTransport } from '@/net/localTransport'
import { PeerClientTransport, PeerHostTransport } from '@/net/peerTransport'

export function createHostTransport(kind: TransportKind): HostTransport {
  return kind === 'local' ? new LocalHostTransport() : new PeerHostTransport()
}

export function createClientTransport(kind: TransportKind): ClientTransport {
  return kind === 'local' ? new LocalClientTransport() : new PeerClientTransport()
}
