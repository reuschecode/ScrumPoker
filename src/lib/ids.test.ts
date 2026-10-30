import { describe, expect, it } from 'vitest'
import { TABLE_CODE_LENGTH, generateTableCode, isValidTableCode, normalizeTableCode } from './ids'

describe('códigos de mesa', () => {
  it('genera códigos válidos del largo configurado', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateTableCode()
      expect(code).toHaveLength(TABLE_CODE_LENGTH)
      expect(isValidTableCode(code)).toBe(true)
    }
  })

  it('normaliza mayúsculas, espacios y guiones sin alterar las letras', () => {
    expect(normalizeTableCode(' ab-c 2x9 ')).toBe('ABC2X9')
    expect(normalizeTableCode('abc2x9zz')).toBe('ABC2X9')
  })

  it('no convierte O/I/L en dígitos: esos caracteres no existen en el alfabeto y el código es inválido', () => {
    expect(normalizeTableCode('oil234')).toBe('OIL234')
    expect(isValidTableCode('OIL234')).toBe(false)
    expect(isValidTableCode('012345')).toBe(false)
    expect(isValidTableCode('ABC2X9')).toBe(true)
  })
})
