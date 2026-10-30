/**
 * Store de la mesa (zustand). Mantiene la sesión activa (host o cliente) y refleja su snapshot
 * para que la UI lo consuma con `useTable()` (hooks.ts).
 */
import { create } from 'zustand'
import { createTableState } from '@/domain/table'
import type { ConnectionStatus, Session, SessionSnapshot } from '@/net/protocol'
import { TransportError } from '@/net/protocol'
import { HostSession } from '@/net/hostSession'
import { ClientSession } from '@/net/clientSession'
import { createClientTransport, createHostTransport } from '@/net/transports'
import { loadHostTable, removeHostTable } from '@/net/hostStorage'
import { configuredTransport } from '@/lib/env'
import { generateTableCode, isValidTableCode, normalizeTableCode } from '@/lib/ids'
import { sanitizeName, useIdentity } from '@/store/identity'
import { forgetTable, rememberTable } from '@/store/recentTables'
import type { TableStore } from '@/store/types'

const MAX_CODE_ATTEMPTS = 5
/**
 * Tiempo durante el que se insiste en retomar una mesa propia cuyo código sigue ocupado. El servidor
 * de señalización puede retener el id de un host que perdió la red sin cerrar su WebSocket.
 */
const HOST_RESUME_WINDOW_MS = 90_000

/**
 * El usuario abandonó la mesa mientras se creaba. No es un fallo: quien llamó a `createTable` no
 * debe navegar a la mesa ni mostrar un error.
 */
export class TableCreationCancelled extends Error {
  constructor() {
    super('Se canceló la creación de la mesa')
    this.name = 'TableCreationCancelled'
  }
}

/** Estados en los que la sesión ya no sirve: volver a entrar crea una sesión nueva. */
function isTerminal(status: ConnectionStatus | undefined): boolean {
  return status === 'not-found' || status === 'kicked' || status === 'closed' || status === 'error'
}

let unsubscribeSnapshot: (() => void) | null = null
/** Nombre de la mesa ya guardado en "recientes" para la sesión actual (evita escrituras repetidas). */
let rememberedName: string | null = null

function transportMessage(err: unknown): string {
  if (err instanceof TransportError) {
    switch (err.code) {
      case 'unsupported':
        return 'Tu navegador no soporta este modo de conexión'
      case 'timeout':
        return 'La conexión tardó demasiado. Inténtalo de nuevo'
      case 'network':
        return 'No se pudo conectar con el servidor. Revisa tu conexión'
      case 'code-taken':
        return 'No se encontró un código libre. Inténtalo de nuevo'
      case 'not-found':
        return 'No se encontró la mesa'
    }
  }
  return err instanceof Error && err.message ? err.message : 'Algo salió mal'
}

function syntheticSnapshot(
  code: string,
  me: string,
  status: ConnectionStatus,
  lastError: SessionSnapshot['lastError'] = null,
): SessionSnapshot {
  return { role: 'client', code, status, state: null, me, lastError }
}

function detach(): void {
  unsubscribeSnapshot?.()
  unsubscribeSnapshot = null
  rememberedName = null
}

function trackRecent(session: Session, snap: SessionSnapshot): void {
  if (snap.status === 'closed' || snap.status === 'kicked') {
    forgetTable(session.code)
    return
  }
  if (snap.status === 'connected' && snap.state && snap.state.name !== rememberedName) {
    rememberedName = snap.state.name
    rememberTable({ code: session.code, name: snap.state.name, role: session.role })
  }
}

/** Adopta una sesión: el store refleja su snapshot actual y cada actualización, salvo las de `hide`. */
function attach(session: Session, hide?: (snap: SessionSnapshot) => boolean): void {
  detach()
  unsubscribeSnapshot = session.subscribe((snap) => {
    if (useTableStore.getState().session !== session || hide?.(snap)) return
    useTableStore.setState({ snapshot: snap })
    trackRecent(session, snap)
  })
  const snap = session.getSnapshot()
  useTableStore.setState({ session, snapshot: snap })
  trackRecent(session, snap)
}

export const useTableStore = create<TableStore>()((set, get) => ({
  session: null,
  snapshot: null,

  createTable: async ({ tableName, deck }) => {
    const { identity } = useIdentity.getState()
    if (!identity.name.trim()) throw new Error('Primero elige tu nombre')
    const name = tableName.trim()
    if (!name) throw new Error('Ponle un nombre a la mesa')
    get().leaveTable()
    const kind = configuredTransport()

    /** La mesa ya no le interesa a nadie: `leave` pudo persistirla, así que no debe quedar guardada. */
    const cancelled = (code: string): TableCreationCancelled => {
      if (get().session?.code !== code) removeHostTable(code)
      return new TableCreationCancelled()
    }

    let lastError: unknown = null
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateTableCode()
      const state = createTableState({
        code,
        name,
        host: { id: identity.id, name: identity.name },
        deck,
        now: Date.now(),
      })
      const session = new HostSession({ code, identity, transport: createHostTransport(kind), initial: state })
      attach(session)
      try {
        await session.start()
      } catch (err) {
        if (get().session !== session) throw cancelled(code)
        lastError = err
        detach()
        set({ session: null, snapshot: null })
        if (!(err instanceof TransportError && err.code === 'code-taken')) break
        continue
      }
      if (get().session !== session) throw cancelled(code)
      rememberTable({ code, name: state.name, role: 'host' })
      return code
    }
    // Se relanza el error original (TransportError) para que la UI pueda mapear su código.
    throw lastError instanceof Error ? lastError : new Error(transportMessage(lastError))
  },

  joinTable: async (rawCode) => {
    const code = normalizeTableCode(rawCode)
    const current = get().session
    if (current && current.code === code && !isTerminal(get().snapshot?.status)) return
    if (current) get().leaveTable()
    const { identity } = useIdentity.getState()
    const kind = configuredTransport()

    if (!isValidTableCode(code)) {
      set({ session: null, snapshot: syntheticSnapshot(code, identity.id, 'not-found') })
      return
    }

    try {
      const resumeDeadline = Date.now() + HOST_RESUME_WINDOW_MS
      for (;;) {
        const stored = loadHostTable(code)
        if (stored && stored.state.closed) removeHostTable(code)
        const ownsTable = !!stored && !stored.state.closed && stored.state.hostId === identity.id
        if (ownsTable) {
          const host = new HostSession({
            code,
            identity,
            transport: createHostTransport(kind),
            initial: { resume: { state: stored.state, secrets: stored.secrets } },
          })
          attach(host)
          try {
            await host.start()
            return
          } catch (err) {
            if (get().session !== host) return // alguien salió de la mesa mientras tanto
            detach()
            if (!(err instanceof TransportError && err.code === 'code-taken')) {
              // El snapshot de la sesión ya refleja status 'error' + lastError.
              set({ session: null })
              return
            }
            // Código ocupado: otra pestaña nuestra hostea la mesa o el servidor retiene nuestro id.
            // Se distingue probando a entrar como cliente.
          }
        }
        const client = new ClientSession({
          code,
          identity,
          transport: createClientTransport(kind),
          getName: () => useIdentity.getState().identity.name,
        })
        // Si la mesa es nuestra, "no hay anfitrión" no es un resultado para el usuario: toca hostearla.
        attach(client, (snap) => ownsTable && snap.status === 'not-found')
        await client.start()
        if (!ownsTable || get().session !== client) return
        const snap = client.getSnapshot()
        if (snap.status !== 'not-found') return
        if (Date.now() <= resumeDeadline) continue
        set({
          snapshot: {
            ...snap,
            status: 'error',
            lastError: {
              code: 'host-resume-failed',
              message: 'No se pudo retomar tu mesa. Inténtalo de nuevo en un momento',
              at: Date.now(),
            },
          },
        })
        return
      }
    } catch (err) {
      detach()
      set({
        session: null,
        snapshot: syntheticSnapshot(code, identity.id, 'error', {
          code: 'unexpected',
          message: transportMessage(err),
          at: Date.now(),
        }),
      })
    }
  },

  dispatch: (cmd) => {
    get().session?.dispatch(cmd)
    if (cmd.type === 'SET_NAME' && sanitizeName(cmd.name)) useIdentity.getState().setName(cmd.name)
  },

  leaveTable: () => {
    const { session } = get()
    detach()
    if (session) {
      try {
        session.leave()
      } catch (err) {
        console.error('[store] error al salir de la mesa', err)
      }
    }
    set({ session: null, snapshot: null })
  },
}))
