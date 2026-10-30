import { describe, expect, it } from 'vitest'
import type { Participant } from '@/domain/types'
import { layoutSeats, orderParticipants } from './seatLayout'

const p = (id: string, joinedAt: number): Participant => ({ id, name: id, joinedAt, connected: true })

describe('layoutSeats', () => {
  it('sin asientos devuelve vacío', () => {
    expect(layoutSeats(0, 40, 30)).toEqual([])
  })

  it('el índice 0 queda abajo-centro', () => {
    const [me] = layoutSeats(1, 40, 30)
    expect(me).toEqual({ x: 50, y: 80 })
  })

  it('con dos asientos el otro queda arriba-centro', () => {
    const [, other] = layoutSeats(2, 40, 30)
    expect(other).toEqual({ x: 50, y: 20 })
  })

  it('recorre la elipse en sentido horario (abajo → izquierda → arriba → derecha)', () => {
    const [bottom, left, top, right] = layoutSeats(4, 40, 30)
    expect(bottom).toEqual({ x: 50, y: 80 })
    expect(left).toEqual({ x: 10, y: 50 })
    expect(top).toEqual({ x: 50, y: 20 })
    expect(right).toEqual({ x: 90, y: 50 })
  })

  it('todas las posiciones caen sobre la elipse', () => {
    for (const { x, y } of layoutSeats(24, 40, 31)) {
      const r = ((x - 50) / 40) ** 2 + ((y - 50) / 31) ** 2
      expect(r).toBeCloseTo(1, 2)
    }
  })
})

describe('orderParticipants', () => {
  it('me pone primero y conserva el orden de ingreso del resto', () => {
    const list = [p('b', 2), p('me', 3), p('a', 1), p('c', 4)]
    expect(orderParticipants(list, 'me').map((x) => x.id)).toEqual(['me', 'a', 'b', 'c'])
  })

  it('si no estoy en la lista, solo ordena por ingreso', () => {
    const list = [p('b', 2), p('a', 1)]
    expect(orderParticipants(list, 'zzz').map((x) => x.id)).toEqual(['a', 'b'])
  })
})
