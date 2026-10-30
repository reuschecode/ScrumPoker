import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTableState } from '@/domain/table'
import type { Conn, HostTransport, SessionSnapshot } from '@/net/protocol'
import { TransportError } from '@/net/protocol'
import { hostStorageKey, saveHostTable } from '@/net/hostStorage'

const transports = vi.hoisted(() => ({
  listen: (() => Promise.resolve()) as (code: string) => Promise<void>,
  connect: (() => Promise.reject(new Error('sin guion'))) as () => Promise<unknown>,
}))

vi.mock('@/net/transports', () => ({
  createHostTransport: (): HostTransport => ({
    listen: (code: string) => transports.listen(code),
    close: () => {},
  }),
  createClientTransport: () => ({ connect: () => transports.connect() }),
}))

// Tras el mock: estos módulos importan los transportes.
const { useTableStore, TableCreationCancelled } = await import('@/store/tableStore')
const { useIdentity } = await import('@/store/identity')

const CODE = 'ABC234'

/** Conexión con un host vivo que responde al hello con un welcome. */
function liveHostConn(): Conn {
  const state = createTableState({ code: CODE, name: 'Mesa', host: { id: 'otro', name: 'X' }, deck: 'fibonacci', now: 1 })
  let onMessage: (msg: unknown) => void = () => {}
  return {
    id: 'c',
    send: (msg) => {
      if ((msg as { t: string }).t === 'hello') onMessage({ t: 'welcome', you: 'me', state })
    },
    onMessage: (cb) => {
      onMessage = cb
      return () => {}
    },
    onClose: () => () => {},
    close: () => {},
  }
}

function storeOwnTable() {
  const { identity } = useIdentity.getState()
  const state = createTableState({
    code: CODE,
    name: 'Mía',
    host: { id: identity.id, name: identity.name },
    deck: 'fibonacci',
    now: 1,
  })
  saveHostTable(CODE, { state, secrets: {} })
}

describe('tableStore', () => {
  const published: SessionSnapshot[] = []
  let unsubscribe = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    })
    useIdentity.getState().setName('Ana')
    published.length = 0
    unsubscribe = useTableStore.subscribe((s) => {
      if (s.snapshot) published.push(s.snapshot)
    })
  })
  afterEach(() => {
    unsubscribe()
    useTableStore.getState().leaveTable()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const statuses = () => published.map((s) => s.status)
  const errors = () => published.filter((s) => s.lastError).map((s) => s.lastError?.code)

  it('con otra pestaña hosteando, entra como cliente sin publicar ningún error', async () => {
    storeOwnTable()
    transports.listen = () => Promise.reject(new TransportError('code-taken'))
    transports.connect = () => Promise.resolve(liveHostConn())

    await useTableStore.getState().joinTable(CODE)

    expect(useTableStore.getState().snapshot).toMatchObject({ role: 'client', status: 'connected' })
    expect(statuses()).not.toContain('error')
    expect(errors()).toEqual([])
  })

  it('si el código sigue retenido pero no hay anfitrión, vuelve a hostear sin mostrar not-found', async () => {
    storeOwnTable()
    let listens = 0
    transports.listen = () => {
      listens += 1
      return listens === 1 ? Promise.reject(new TransportError('code-taken')) : Promise.resolve()
    }
    transports.connect = () => Promise.reject(new TransportError('not-found'))

    const joined = useTableStore.getState().joinTable(CODE)
    await vi.advanceTimersByTimeAsync(5_000)
    await joined

    expect(listens).toBe(2)
    expect(useTableStore.getState().snapshot).toMatchObject({ role: 'host', status: 'connected' })
    expect(statuses()).not.toContain('not-found')
    expect(errors()).toEqual([])
  })

  it('se rinde al agotar la ventana, con un error propio de quien retoma su mesa', async () => {
    storeOwnTable()
    transports.listen = () => Promise.reject(new TransportError('code-taken'))
    transports.connect = () => Promise.reject(new TransportError('not-found'))

    const joined = useTableStore.getState().joinTable(CODE)
    await vi.advanceTimersByTimeAsync(100_000)
    await joined

    expect(useTableStore.getState().snapshot).toMatchObject({
      status: 'error',
      lastError: { code: 'host-resume-failed' },
    })
    expect(statuses()).not.toContain('not-found')
  })

  it('un cliente sin mesa propia sigue viendo not-found sin reintentos', async () => {
    let listens = 0
    transports.listen = () => {
      listens += 1
      return Promise.resolve()
    }
    transports.connect = () => Promise.reject(new TransportError('not-found'))

    const joined = useTableStore.getState().joinTable(CODE)
    await vi.advanceTimersByTimeAsync(5_000)
    await joined

    expect(listens).toBe(0)
    expect(useTableStore.getState().snapshot?.status).toBe('not-found')
  })

  it('si se abandona la mesa mientras se crea, se cancela sin dejar rastro', async () => {
    let open = () => {}
    let requested = ''
    transports.listen = (code) => {
      requested = code
      return new Promise((resolve) => {
        open = resolve
      })
    }

    const created = useTableStore.getState().createTable({ tableName: 'Nueva', deck: 'fibonacci' })
    useTableStore.getState().leaveTable()
    expect(localStorage.getItem(hostStorageKey(requested))).not.toBeNull() // leave la persistió
    open()

    await expect(created).rejects.toBeInstanceOf(TableCreationCancelled)
    expect(localStorage.getItem(hostStorageKey(requested))).toBeNull()
    expect(localStorage.getItem('sp:recent')).toBeNull()
  })

  it('crear una mesa sin interrupciones sigue devolviendo el código', async () => {
    transports.listen = () => Promise.resolve()
    const code = await useTableStore.getState().createTable({ tableName: 'Nueva', deck: 'fibonacci' })
    expect(useTableStore.getState().snapshot).toMatchObject({ code, role: 'host', status: 'connected' })
  })

  it('un SET_NAME sin nada visible no borra el nombre local', () => {
    useTableStore.getState().dispatch({ type: 'SET_NAME', name: '​' })
    expect(useIdentity.getState().identity.name).toBe('Ana')
  })
})
