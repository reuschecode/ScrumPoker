import { customAlphabet, nanoid } from 'nanoid'

/** Alfabeto sin caracteres ambiguos (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TABLE_CODE_LENGTH = 6
const codeGen = customAlphabet(CODE_ALPHABET, TABLE_CODE_LENGTH)

export function generateTableCode(): string {
  return codeGen()
}

/**
 * Normaliza un código escrito por el usuario (mayúsculas, sin espacios ni guiones).
 * No "corrige" 0/O ni 1/I/L: el alfabeto excluye todos esos caracteres, así que un código que los
 * contenga es inválido de todos modos y `isValidTableCode` lo rechaza (la UI muestra el error).
 */
export function normalizeTableCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, TABLE_CODE_LENGTH)
}

export function isValidTableCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${TABLE_CODE_LENGTH}}$`).test(code)
}

export function newId(size = 12): string {
  return nanoid(size)
}

export function newSecret(): string {
  return nanoid(32)
}
