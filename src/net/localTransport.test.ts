/**
 * Transporte 'local' sobre BroadcastChannel (Node ≥ 18 lo implementa; entre instancias del mismo hilo).
 * Usa temporizadores reales: el sondeo del host (400 ms) y el timeout de connect (1,5 s) son cortos.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { Conn } from '@/net/protocol'
import { TransportError } from '@/net/protocol'
import { LocalClientTransport, LocalHostTransport } from '@/net/localTransport'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function nextMessage(conn: Conn): Promise<unknown> {
  return new Promise((resolve) => {
    const off = conn.onMessage((msg) => {
      off()
      resolve(msg)
    })
  })
}

function closed(conn: Conn): Promise<string | undefined> {
  return new Promise((resolve) => {
    conn.onClose((reason) => resolve(reason))
  })
}

function tick(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('LocalHostTransport / LocalClientTransport', () => {
  it('abre una conexión lógica y entrega datos en ambos sentidos', async () => {
    const host = new LocalHostTransport()
    cleanups.push(() => host.close())
    const incoming: Conn[] = []
    await host.listen('LOCAL1', (conn) => incoming.push(conn))

    const clientConn = await new LocalClientTransport().connect('LOCAL1')
    cleanups.push(() => clientConn.close())
    await tick()
    expect(incoming).toHaveLength(1)
    const hostConn = incoming[0]

    const toHost = nextMessage(hostConn)
    clientConn.send({ t: 'hello', n: 1 })
    expect(await toHost).toEqual({ t: 'hello', n: 1 })

    const toClient = nextMessage(clientConn)
    hostConn.send({ t: 'welcome' })
    expect(await toClient).toEqual({ t: 'welcome' })

    // El cierre del cliente llega al host; el propio cliente también recibe su onClose.
    const hostSaw = closed(hostConn)
    const clientSaw = closed(clientConn)
    clientConn.close()
    expect(await clientSaw).toBe('closed')
    expect(await hostSaw).toBe('remote')
  })

  it('rechaza con code-taken si ya hay un host para ese código', async () => {
    const first = new LocalHostTransport()
    cleanups.push(() => first.close())
    await first.listen('LOCAL2', () => {})

    const second = new LocalHostTransport()
    cleanups.push(() => second.close())
    await expect(second.listen('LOCAL2', () => {})).rejects.toMatchObject({ code: 'code-taken' })
  })

  it('rechaza con not-found si nadie acepta la conexión', async () => {
    const err = await new LocalClientTransport().connect('LOCAL3').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TransportError)
    expect((err as TransportError).code).toBe('not-found')
  })

  it('host.close() cierra las conexiones de los clientes', async () => {
    const host = new LocalHostTransport()
    await host.listen('LOCAL4', () => {})
    const clientConn = await new LocalClientTransport().connect('LOCAL4')
    const sawClose = closed(clientConn)
    await tick()
    host.close()
    expect(await sawClose).toBe('remote')
  })
})
