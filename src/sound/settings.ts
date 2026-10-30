import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { clamp } from '@/lib/utils'

export const SOUND_SETTINGS_KEY = 'sp:sound'
export const DEFAULT_VOLUME = 0.35

export interface SoundSettings {
  muted: boolean
  /** Volumen maestro, 0..1. */
  volume: number
  toggleMuted: () => void
  setMuted: (muted: boolean) => void
  setVolume: (volume: number) => void
}

type PersistedSoundSettings = Pick<SoundSettings, 'muted' | 'volume'>

// localStorage puede no existir (SSR/tests) o lanzar (modo privado, cuota, bloqueo):
// se cae a memoria para que el store nunca falle ni avise por consola.
const memory = new Map<string, string>()
const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  },
}

function normalizeVolume(volume: number): number {
  return Number.isFinite(volume) ? clamp(volume, 0, 1) : DEFAULT_VOLUME
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

export const useSoundSettings = create<SoundSettings>()(
  persist(
    (set) => ({
      muted: false,
      volume: DEFAULT_VOLUME,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setMuted: (muted) => set({ muted }),
      setVolume: (volume) => set({ volume: normalizeVolume(volume) }),
    }),
    {
      name: SOUND_SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage<PersistedSoundSettings>(() => safeStorage),
      partialize: (s): PersistedSoundSettings => ({ muted: s.muted, volume: s.volume }),
      // Valida lo persistido: un JSON manipulado o antiguo no debe romper el store.
      merge: (persisted, current) => {
        const p = isRecord(persisted) ? persisted : {}
        return {
          ...current,
          muted: typeof p.muted === 'boolean' ? p.muted : current.muted,
          volume: typeof p.volume === 'number' ? normalizeVolume(p.volume) : current.volume,
        }
      },
    },
  ),
)
