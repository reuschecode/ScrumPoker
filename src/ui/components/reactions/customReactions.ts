import { create } from 'zustand'
import { isReactionEmoji } from '@/domain/emoji'
import { REACTION_EMOJIS } from '@/domain/types'

const KEY = 'sp:reactions'
/** Emojis propios que se quedan en la barra, del más reciente al más antiguo. */
export const MAX_CUSTOM_REACTIONS = 5

function load(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter(isReactionEmoji).slice(0, MAX_CUSTOM_REACTIONS) : []
  } catch {
    return []
  }
}

interface CustomReactions {
  emojis: string[]
  /** Guarda un emoji usado desde el selector; los de la barra fija no se repiten. */
  remember: (emoji: string) => void
  forget: (emoji: string) => void
}

function save(emojis: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(emojis))
  } catch {
    /* sin almacenamiento: solo en memoria */
  }
}

export const useCustomReactions = create<CustomReactions>((set, get) => ({
  emojis: load(),
  remember: (emoji) => {
    if (!isReactionEmoji(emoji) || (REACTION_EMOJIS as readonly string[]).includes(emoji)) return
    const emojis = [emoji, ...get().emojis.filter((e) => e !== emoji)].slice(0, MAX_CUSTOM_REACTIONS)
    save(emojis)
    set({ emojis })
  },
  forget: (emoji) => {
    const emojis = get().emojis.filter((e) => e !== emoji)
    save(emojis)
    set({ emojis })
  },
}))
