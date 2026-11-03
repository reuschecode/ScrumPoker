/** Una reacción es un único emoji: un solo grafema con pictograma, bandera o tecla (1️⃣). */
const MAX_EMOJI_LENGTH = 32
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u
// Fuera de los propios emojis solo se admiten sus modificadores (ZWJ, selectores, tonos, etiquetas).
const ALLOWED = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣]|[\u{E0020}-\u{E007F}])+$/u

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null

function graphemeCount(s: string): number {
  if (!segmenter) return [...s].length
  let n = 0
  for (const _ of segmenter.segment(s)) n++
  return n
}

export function isReactionEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_EMOJI_LENGTH) return false
  return PICTOGRAPHIC.test(value) && ALLOWED.test(value) && graphemeCount(value) === 1
}

/** Extrae el primer emoji de un texto escrito o pegado, o null si no hay ninguno. */
export function firstEmoji(text: string): string | null {
  const parts = segmenter ? Array.from(segmenter.segment(text.trim()), (s) => s.segment) : [...text.trim()]
  return parts.find((g) => isReactionEmoji(g)) ?? null
}
