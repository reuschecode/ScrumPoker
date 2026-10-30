import type { Deck, UserId, VoteStats } from '@/domain/types'
import { cardIndex, cardNumericValue, isSpecialCard } from '@/domain/deck'

const EPSILON = 1e-9

/**
 * Estadísticas de una ronda. `votes` son los valores reales (estado del host), nunca
 * la proyección con votos ocultos.
 */
export function computeStats(votes: Record<UserId, string>, deck: Deck): VoteStats {
  const entries = Object.entries(votes)
  const count = entries.length

  // Agrupa por valor; el orden de los votantes es el de emisión.
  const groups = new Map<string, UserId[]>()
  for (const [userId, value] of entries) {
    const voters = groups.get(value)
    if (voters) voters.push(userId)
    else groups.set(value, [userId])
  }
  // Orden del mazo; un valor ajeno al mazo (no debería ocurrir) va al final, por orden de aparición.
  const position = (value: string) => {
    const i = cardIndex(deck, value)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const distribution = [...groups.entries()]
    .map(([value, voters]) => ({ value, count: voters.length, voters }))
    .sort((a, b) => position(a.value) - position(b.value))

  const numeric = entries
    .map(([, value]) => cardNumericValue(value))
    .filter((n): n is number => n !== null)
  const numericCount = numeric.length
  const average = numericCount > 0 ? numeric.reduce((sum, n) => sum + n, 0) / numericCount : null
  const median = numericCount > 0 ? medianOf(numeric) : null

  const maxFrequency = distribution.reduce((max, d) => Math.max(max, d.count), 0)
  const mode = distribution.filter((d) => d.count === maxFrequency).map((d) => d.value)

  // Las cartas especiales ('?', '☕') no rompen el consenso: quien las usa no está estimando.
  const estimates = entries.map(([, value]) => value).filter((value) => !isSpecialCard(value))
  const consensus = estimates.length >= 2 && estimates.every((value) => value === estimates[0])

  return {
    count,
    numericCount,
    average,
    median,
    mode,
    distribution,
    consensus,
    suggested: suggestScore(mode, average, deck),
  }
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Puntaje propuesto: la moda si es única y no es especial; si no, la carta numérica del
 * mazo más cercana al promedio; si tampoco hay promedio, el primer valor no especial de la moda.
 */
function suggestScore(mode: string[], average: number | null, deck: Deck): string | null {
  if (mode.length === 1 && !isSpecialCard(mode[0])) return mode[0]
  if (average !== null) {
    const closest = closestNumericCard(deck, average)
    if (closest !== null) return closest
  }
  return mode.find((value) => !isSpecialCard(value)) ?? null
}

/** Carta numérica del mazo más cercana a `target`; en empate, la mayor. */
export function closestNumericCard(deck: Deck, target: number): string | null {
  let best: string | null = null
  let bestValue = -Infinity
  let bestDistance = Infinity
  for (const card of deck.cards) {
    const n = cardNumericValue(card)
    if (n === null) continue
    const distance = Math.abs(n - target)
    const closer = distance < bestDistance - EPSILON
    const tieButLarger = Math.abs(distance - bestDistance) <= EPSILON && n > bestValue
    if (closer || tieButLarger) {
      best = card
      bestValue = n
      bestDistance = distance
    }
  }
  return best
}
