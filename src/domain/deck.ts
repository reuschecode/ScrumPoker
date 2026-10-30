import { SPECIAL_CARDS, type Deck, type DeckId } from '@/domain/types'

/** Mazos disponibles. `DECK_LIST` fija el orden en que se ofrecen en la UI. */
export const DECKS: Record<DeckId, Deck> = {
  fibonacci: {
    id: 'fibonacci',
    label: 'Fibonacci',
    description: 'La clásica: 0, 1, 2, 3, 5, 8, 13, 21, 34.',
    cards: ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'],
  },
  modified: {
    id: 'modified',
    label: 'Fibonacci modificada',
    description: 'Con ½ y cifras redondas (20, 40, 100) para historias grandes.',
    cards: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'],
  },
  tshirt: {
    id: 'tshirt',
    label: 'Tallas',
    description: 'Estimación relativa sin números, de XS a XXL.',
    cards: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
  },
  powers: {
    id: 'powers',
    label: 'Potencias de 2',
    description: 'Cada carta duplica la anterior: 1, 2, 4, 8, 16, 32, 64.',
    cards: ['0', '1', '2', '4', '8', '16', '32', '64', '?', '☕'],
  },
}

export const DECK_IDS: readonly DeckId[] = ['fibonacci', 'modified', 'tshirt', 'powers']

export const DECK_LIST: Deck[] = DECK_IDS.map((id) => DECKS[id])

export function isDeckId(value: unknown): value is DeckId {
  return typeof value === 'string' && (DECK_IDS as readonly string[]).includes(value)
}

/** Devuelve el mazo pedido; ante un id desconocido (datos corruptos) cae en Fibonacci. */
export function getDeck(id: DeckId): Deck {
  return isDeckId(id) ? DECKS[id] : DECKS.fibonacci
}

export function isCardOf(deck: Deck, value: string): boolean {
  return deck.cards.includes(value)
}

/** Posición de la carta en el mazo, o -1 si no pertenece. */
export function cardIndex(deck: Deck, value: string): number {
  return deck.cards.indexOf(value)
}

export function isSpecialCard(value: string): boolean {
  return (SPECIAL_CARDS as readonly string[]).includes(value)
}

const NUMERIC_RE = /^\d+(?:\.\d+)?$/

/** '½' → 0.5; cadenas numéricas → número; tallas, '?' y '☕' → null. */
export function cardNumericValue(value: string): number | null {
  if (value === '½') return 0.5
  if (!NUMERIC_RE.test(value)) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
