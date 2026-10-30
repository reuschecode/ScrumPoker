import { describe, expect, it } from 'vitest'
import { AVATAR_STYLES } from '@/domain/avatars'
import { renderAvatar } from './avatarImage'

describe('renderAvatar', () => {
  for (const { id } of AVATAR_STYLES) {
    if (id === 'initials') continue
    it(`dibuja ${id} de forma determinista`, async () => {
      const uri = await renderAvatar(id, 'usuario-1')
      expect(uri.startsWith('data:image/svg+xml')).toBe(true)
      expect(await renderAvatar(id, 'usuario-1')).toBe(uri)
      expect(await renderAvatar(id, 'usuario-2')).not.toBe(uri)
    })
  }
})
