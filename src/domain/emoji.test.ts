import { describe, expect, it } from 'vitest'
import { firstEmoji, isReactionEmoji } from './emoji'

describe('isReactionEmoji', () => {
  it.each(['👍', '❤️', '🦄', '👍🏽', '👨‍👩‍👧', '🇵🇪', '1️⃣', '🏳️‍🌈', '☕'])('acepta %s', (e) => {
    expect(isReactionEmoji(e)).toBe(true)
  })

  it.each(['', 'a', 'hola', '1', '👍👍', '👍a', ' 👍', '<b>', 42, null, '​', '‍'])('rechaza %j', (e) => {
    expect(isReactionEmoji(e)).toBe(false)
  })
})

describe('firstEmoji', () => {
  it('saca el primer emoji de lo que se escribe o pega', () => {
    expect(firstEmoji('  🦄 ')).toBe('🦄')
    expect(firstEmoji('hola 🚀 y 🎉')).toBe('🚀')
    expect(firstEmoji('sin emojis')).toBeNull()
  })
})
