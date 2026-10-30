import { describe, expect, it } from 'vitest'
import { DECKS, closestNumericCard, computeStats } from '@/domain'

const fib = DECKS.fibonacci
const modified = DECKS.modified
const tshirt = DECKS.tshirt

describe('computeStats', () => {
  it('sin votos devuelve todo vacío', () => {
    expect(computeStats({}, fib)).toEqual({
      count: 0,
      numericCount: 0,
      average: null,
      median: null,
      mode: [],
      distribution: [],
      consensus: false,
      suggested: null,
    })
  })

  it('un solo voto', () => {
    expect(computeStats({ a: '5' }, fib)).toEqual({
      count: 1,
      numericCount: 1,
      average: 5,
      median: 5,
      mode: ['5'],
      distribution: [{ value: '5', count: 1, voters: ['a'] }],
      consensus: false,
      suggested: '5',
    })
  })

  it('moda única → sugerida; promedio sin redondear', () => {
    const stats = computeStats({ a: '5', b: '5', c: '8' }, fib)
    expect(stats.mode).toEqual(['5'])
    expect(stats.suggested).toBe('5')
    expect(stats.average).toBeCloseTo(6, 10)
    expect(stats.median).toBe(5)
    expect(stats.consensus).toBe(false)
    const thirds = computeStats({ a: '1', b: '2', c: '2' }, fib)
    expect(thirds.average).toBeCloseTo(5 / 3, 10)
  })

  it('empate → moda en orden del mazo y sugerida por cercanía al promedio', () => {
    const stats = computeStats({ a: '8', b: '3' }, fib)
    expect(stats.mode).toEqual(['3', '8'])
    expect(stats.average).toBe(5.5)
    expect(stats.median).toBe(5.5)
    expect(stats.suggested).toBe('5')
  })

  it('empate en la distancia → la carta mayor', () => {
    expect(computeStats({ a: '5', b: '8' }, fib).suggested).toBe('8')
    expect(computeStats({ a: '1', b: '2' }, fib).suggested).toBe('2')
    expect(computeStats({ a: '0', b: '1' }, fib).suggested).toBe('1')
  })

  it('mediana con cantidad par e impar', () => {
    expect(computeStats({ a: '1', b: '8', c: '3' }, fib).median).toBe(3)
    expect(computeStats({ a: '1', b: '2', c: '3', d: '5' }, fib).median).toBe(2.5)
  })

  it('las cartas especiales cuentan pero no son numéricas', () => {
    const stats = computeStats({ a: '5', b: '?', c: '☕' }, fib)
    expect(stats.count).toBe(3)
    expect(stats.numericCount).toBe(1)
    expect(stats.average).toBe(5)
    expect(stats.mode).toEqual(['5', '?', '☕'])
    expect(stats.suggested).toBe('5')
    expect(stats.consensus).toBe(false)
  })

  it('moda única especial → se sugiere la carta más cercana al promedio', () => {
    const stats = computeStats({ a: '?', b: '?', c: '3' }, fib)
    expect(stats.mode).toEqual(['?'])
    expect(stats.suggested).toBe('3')
  })

  it('solo especiales → sin sugerencia', () => {
    expect(computeStats({ a: '?' }, fib).suggested).toBeNull()
    const both = computeStats({ a: '?', b: '☕' }, fib)
    expect(both.mode).toEqual(['?', '☕'])
    expect(both.suggested).toBeNull()
    expect(both.average).toBeNull()
    expect(both.consensus).toBe(false)
  })

  it('consenso: ≥2 estimaciones iguales; las especiales no lo rompen', () => {
    expect(computeStats({ a: '5', b: '5' }, fib).consensus).toBe(true)
    expect(computeStats({ a: '5' }, fib).consensus).toBe(false)
    expect(computeStats({ a: '5', b: '5', c: '8' }, fib).consensus).toBe(false)
    expect(computeStats({ a: '5', b: '5', c: '?' }, fib).consensus).toBe(true)
    expect(computeStats({ a: '?', b: '?' }, fib).consensus).toBe(false)
  })

  it('tallas: sin números, moda y consenso funcionan', () => {
    const tie = computeStats({ a: 'L', b: 'M' }, tshirt)
    expect(tie.numericCount).toBe(0)
    expect(tie.average).toBeNull()
    expect(tie.median).toBeNull()
    expect(tie.mode).toEqual(['M', 'L'])
    expect(tie.suggested).toBe('M')
    expect(tie.consensus).toBe(false)

    const agreed = computeStats({ a: 'M', b: 'M', c: '?' }, tshirt)
    expect(agreed.consensus).toBe(true)
    expect(agreed.suggested).toBe('M')

    const bigTie = computeStats({ a: 'XL', b: 'S', c: 'S', d: 'XL' }, tshirt)
    expect(bigTie.mode).toEqual(['S', 'XL'])
    expect(bigTie.suggested).toBe('S')

    expect(computeStats({ a: '?', b: '☕' }, tshirt).suggested).toBeNull()
  })

  it('½ vale 0.5', () => {
    const stats = computeStats({ a: '½', b: '1' }, modified)
    expect(stats.numericCount).toBe(2)
    expect(stats.average).toBe(0.75)
    expect(stats.median).toBe(0.75)
    expect(stats.mode).toEqual(['½', '1'])
    expect(stats.suggested).toBe('1')
    const half = computeStats({ a: '½', b: '½' }, modified)
    expect(half.consensus).toBe(true)
    expect(half.suggested).toBe('½')
    expect(half.average).toBe(0.5)
    const low = computeStats({ a: '0', b: '½', c: '1' }, modified)
    expect(low.average).toBe(0.5)
    expect(low.suggested).toBe('½')
  })

  it('distribución en orden del mazo con sus votantes', () => {
    const stats = computeStats({ x: '8', y: '3', z: '8', w: '?' }, fib)
    expect(stats.distribution).toEqual([
      { value: '3', count: 1, voters: ['y'] },
      { value: '8', count: 2, voters: ['x', 'z'] },
      { value: '?', count: 1, voters: ['w'] },
    ])
    expect(stats.mode).toEqual(['8'])
  })

  it('tolera valores ajenos al mazo sin lanzar (van al final)', () => {
    const stats = computeStats({ a: '5', b: '99', c: 'XL' }, fib)
    expect(stats.count).toBe(3)
    expect(stats.distribution.map((d) => d.value)).toEqual(['5', '99', 'XL'])
    expect(stats.numericCount).toBe(2)
  })

  it('no muta los votos de entrada', () => {
    const votes = Object.freeze({ a: '5', b: '8' })
    expect(() => computeStats(votes, fib)).not.toThrow()
  })
})

describe('closestNumericCard', () => {
  it('encuentra la carta numérica más cercana (empate → mayor)', () => {
    expect(closestNumericCard(fib, 100)).toBe('34')
    expect(closestNumericCard(fib, 0)).toBe('0')
    expect(closestNumericCard(fib, 6.5)).toBe('8')
    expect(closestNumericCard(fib, 6.4)).toBe('5')
    expect(closestNumericCard(modified, 0.75)).toBe('1')
    expect(closestNumericCard(DECKS.powers, 48)).toBe('64')
    expect(closestNumericCard(tshirt, 3)).toBeNull()
  })
})
