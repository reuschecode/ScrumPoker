import { create } from 'zustand'
import { newId } from '@/lib/ids'

export type ToastTone = 'neutral' | 'accent' | 'mint' | 'warn' | 'danger'

export interface Toast {
  id: string
  title: string
  description?: string
  tone: ToastTone
  /** Emoji o texto corto que se muestra a la izquierda (opcional). */
  emoji?: string
  durationMs: number
  createdAt: number
}

interface ToastStore {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'createdAt' | 'durationMs' | 'tone'> & Partial<Pick<Toast, 'tone' | 'durationMs'>>) => string
  dismiss: (id: string) => void
  clear: () => void
}

const MAX_VISIBLE = 4

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = newId(8)
    const toast: Toast = {
      id,
      title: t.title,
      description: t.description,
      emoji: t.emoji,
      tone: t.tone ?? 'neutral',
      durationMs: t.durationMs ?? 3200,
      createdAt: Date.now(),
    }
    set((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_VISIBLE) }))
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))

/** Atajo para usar fuera de React. */
export const toast = {
  show: (title: string, opts: Partial<Omit<Toast, 'id' | 'createdAt' | 'title'>> = {}) =>
    useToastStore.getState().push({ title, ...opts }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: 'accent' }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: 'mint' }),
  warn: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: 'warn' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ title, description, tone: 'danger', durationMs: 4500 }),
}
