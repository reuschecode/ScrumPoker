import { describe, expect, it } from 'vitest'
import { formatAverage, formatNames, formatNumber, plural } from './format'

describe('formatNames', () => {
  it('maneja 0, 1 y 2 nombres', () => {
    expect(formatNames([])).toBe('')
    expect(formatNames(['Ana'])).toBe('Ana')
    expect(formatNames(['Ana', 'Luis'])).toBe('Ana y Luis')
  })

  it('usa comas y "y" hasta el máximo', () => {
    expect(formatNames(['Ana', 'Luis', 'Pedro'])).toBe('Ana, Luis y Pedro')
  })

  it('resume los que sobran como "y N más"', () => {
    expect(formatNames(['Ana', 'Luis', 'Pedro', 'Eva'])).toBe('Ana, Luis, Pedro y 1 más')
    expect(formatNames(['Ana', 'Luis', 'Pedro', 'Eva', 'Juan'], 2)).toBe('Ana, Luis y 3 más')
  })
})

describe('números en español', () => {
  it('el promedio lleva siempre un decimal', () => {
    expect(formatAverage(8)).toBe('8,0')
    expect(formatAverage(3.46)).toBe('3,5')
  })

  it('formatNumber recorta a un decimal y omite ceros', () => {
    expect(formatNumber(5)).toBe('5')
    expect(formatNumber(2.5)).toBe('2,5')
  })

  it('plural', () => {
    expect(plural(1, 'voto', 'votos')).toBe('1 voto')
    expect(plural(3, 'voto', 'votos')).toBe('3 votos')
  })
})
