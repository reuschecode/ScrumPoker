/** "Ana" · "Ana y Luis" · "Ana, Luis y Pedro" · "Ana, Luis, Pedro y 2 más". */
export function formatNames(names: readonly string[], max = 3): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`
}

/** Número con hasta `maxDecimals` decimales en formato español (coma decimal). */
export function formatNumber(n: number, maxDecimals = 1): string {
  return n.toLocaleString('es', { maximumFractionDigits: maxDecimals })
}

/** Promedio siempre con 1 decimal: 3,5 · 8,0. */
export function formatAverage(n: number): string {
  return n.toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
