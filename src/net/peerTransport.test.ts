import { describe, expect, it, vi } from 'vitest'
import { pack, unpack, type Packable } from 'peerjs-js-binarypack'
import type { DataConnection } from 'peerjs'
import { LIMITS } from '@/domain/types'
import { createTableState } from '@/domain/table'
import { CONNECT_OPTIONS, PeerConn } from '@/net/peerTransport'

class FakeDc {
  open = true
  connectionId = 'dc1'
  peer = 'p'
  close = vi.fn()
  send = vi.fn()
  private readonly handlers = new Map<string, (arg: unknown) => void>()
  on(event: string, cb: (arg: unknown) => void): void {
    this.handlers.set(event, cb)
  }
  emit(event: string, arg?: unknown): void {
    this.handlers.get(event)?.(arg)
  }
}

function makeConn() {
  const dc = new FakeDc()
  const cleanup = vi.fn()
  const conn = new PeerConn(dc as unknown as DataConnection, cleanup)
  const onClose = vi.fn()
  conn.onClose(onClose)
  return { dc, conn, cleanup, onClose }
}

describe('serialización', () => {
  it('usa binary, que trocea, y un estado grande con todo tipo de datos ida y vuelta queda intacto', () => {
    expect(CONNECT_OPTIONS.serialization).toBe('binary')
    const state = createTableState({
      code: 'ABC234',
      name: 'Mesa ñandú ☕',
      host: { id: 'h', name: 'Ana' },
      deck: 'fibonacci',
      now: Date.now(),
    })
    state.chat = Array.from({ length: LIMITS.MAX_CHAT_MESSAGES }, (_, i) => ({
      id: `m${i}`,
      userId: 'h',
      name: 'Ana',
      text: '•❤️'.repeat(150),
      at: Date.now(),
    }))
    const msg = { t: 'state', state, events: [{ type: 'vote.cast', userId: 'h', changed: false }] }
    const bytes = pack(msg as unknown as Packable) as ArrayBuffer
    expect(bytes.byteLength).toBeGreaterThan(16_300) // el tope de 'json'
    expect(unpack(bytes)).toEqual(msg)
  })
})

describe('PeerConn', () => {
  it("ICE 'disconnected' no cierra la conexión: puede recuperarse", () => {
    const { dc, conn, onClose } = makeConn()
    dc.emit('iceStateChanged', 'disconnected')
    expect(onClose).not.toHaveBeenCalled()
    expect(dc.close).not.toHaveBeenCalled()
    conn.send({ t: 'pong' })
    expect(dc.send).toHaveBeenCalledTimes(1)
  })

  it.each(['failed', 'closed'])("ICE '%s' sí la cierra y libera el canal", (state) => {
    const { dc, cleanup, onClose } = makeConn()
    dc.emit('iceStateChanged', state)
    expect(onClose).toHaveBeenCalledWith(`ice-${state}`)
    expect(dc.close).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('un error del canal lo cierra de verdad, y notifica una sola vez', () => {
    const { dc, onClose } = makeConn()
    dc.emit('error', { type: 'message-too-big' })
    dc.emit('close')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dc.close).toHaveBeenCalledTimes(1)
  })
})
