import { describe, expect, it } from 'vitest'
import { DECKS, DECK_LIST, cardIndex, cardNumericValue, getDeck, isCardOf, isDeckId, isSpecialCard, type DeckId } from '@/domain'

describe('mazos', () => {
  it('se ofrecen en el orden acordado con sus cartas exactas', () => {
    expect(DECK_LIST.map((d) => d.id)).toEqual(['fibonacci', 'modified', 'tshirt', 'powers'])
    expect(DECK_LIST.map((d) => d.label)).toEqual(['Fibonacci', 'Fibonacci modificada', 'Tallas', 'Potencias de 2'])
    expect(DECKS.fibonacci.cards).toEqual(['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'])
    expect(DECKS.modified.cards).toEqual(['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'])
    expect(DECKS.tshirt.cards).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'])
    expect(DECKS.powers.cards).toEqual(['0', '1', '2', '4', '8', '16', '32', '64', '?', '☕'])
    for (const deck of DECK_LIST) {
      expect(DECKS[deck.id]).toBe(deck)
      expect(deck.description.length).toBeGreaterThan(0)
    }
  })

  it('getDeck e isDeckId toleran ids desconocidos', () => {
    expect(getDeck('tshirt').id).toBe('tshirt')
    expect(getDeck('nope' as DeckId)).toBe(DECKS.fibonacci)
    expect(isDeckId('powers')).toBe(true)
    expect(isDeckId('POWERS')).toBe(false)
    expect(isDeckId(undefined)).toBe(false)
    expect(isDeckId('toString')).toBe(false)
  })

  it('isCardOf y cardIndex', () => {
    expect(isCardOf(DECKS.fibonacci, '13')).toBe(true)
    expect(isCardOf(DECKS.fibonacci, '4')).toBe(false)
    expect(isCardOf(DECKS.tshirt, 'M')).toBe(true)
    expect(cardIndex(DECKS.fibonacci, '0')).toBe(0)
    expect(cardIndex(DECKS.fibonacci, '☕')).toBe(10)
    expect(cardIndex(DECKS.fibonacci, 'M')).toBe(-1)
  })

  it('cardNumericValue', () => {
    expect(cardNumericValue('½')).toBe(0.5)
    expect(cardNumericValue('0')).toBe(0)
    expect(cardNumericValue('13')).toBe(13)
    expect(cardNumericValue('100')).toBe(100)
    expect(cardNumericValue('0.5')).toBe(0.5)
    for (const value of ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕', '', ' 5', '5 ', '1e3', '-1', 'abc']) {
      expect(cardNumericValue(value)).toBeNull()
    }
  })

  it('isSpecialCard', () => {
    expect(isSpecialCard('?')).toBe(true)
    expect(isSpecialCard('☕')).toBe(true)
    expect(isSpecialCard('5')).toBe(false)
    expect(isSpecialCard('XL')).toBe(false)
  })
})
