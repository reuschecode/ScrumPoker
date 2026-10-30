import type { TransportKind } from '@/net/protocol'

/** Transporte configurado por entorno (VITE_TRANSPORT). Por defecto 'peer'. */
export function configuredTransport(): TransportKind {
  const raw = (import.meta.env.VITE_TRANSPORT ?? 'peer').toString().toLowerCase()
  return raw === 'local' ? 'local' : 'peer'
}
