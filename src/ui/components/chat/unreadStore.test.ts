import { describe, expect, it } from 'vitest'
import { countUnread } from './unreadStore'

describe('countUnread', () => {
  const chat = [{ id: 'm1' }, { id: 'm2', system: 'joined' }, { id: 'm3' }, { id: 'm4', system: 'left' }]

  it('no cuenta los avisos de conexión', () => {
    expect(countUnread(chat, 'm1')).toBe(1)
    expect(countUnread(chat, 'm3')).toBe(0)
    expect(countUnread(chat, null)).toBe(2)
  })
})
