import type { Participant, UserId } from '@/domain/types'

export interface SeatPosition {
  /** Centro del asiento, en % del ancho del contenedor. */
  x: number
  /** Centro del asiento, en % del alto del contenedor. */
  y: number
}

/** Caja fija de un asiento (px): permite centrarlo con `calc()` sin transformaciones CSS. */
export const SEAT_SIZE = { w: 112, h: 160 } as const

/**
 * Distribuye `count` asientos sobre una elipse centrada en (50 %, 50 %) con radios `rx` y `ry`
 * (en % del contenedor). El índice 0 queda abajo-centro (90°) y el resto avanza en sentido horario
 * a intervalos iguales. En pantalla el eje Y crece hacia abajo, por eso sumar ángulo = horario.
 */
export function layoutSeats(count: number, rx: number, ry: number): SeatPosition[] {
  const n = Math.max(0, Math.floor(count))
  const positions: SeatPosition[] = []
  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 + (2 * Math.PI * i) / n
    positions.push({
      x: round2(50 + rx * Math.cos(angle)),
      y: round2(50 + ry * Math.sin(angle)),
    })
  }
  return positions
}

/** Yo primero; el resto por orden de ingreso. */
export function orderParticipants(participants: readonly Participant[], me: UserId): Participant[] {
  const mine: Participant[] = []
  const others: Participant[] = []
  for (const p of participants) (p.id === me ? mine : others).push(p)
  others.sort((a, b) => a.joinedAt - b.joinedAt)
  return [...mine, ...others]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
