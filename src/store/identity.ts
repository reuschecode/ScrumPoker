import { create } from 'zustand'
import type { Identity } from '@/net/protocol'
import { newId, newSecret } from '@/lib/ids'
import { sanitizeName } from '@/domain/table'

export { sanitizeName }

/** Identidad persistente del navegador (todas las pestañas la comparten). */
const KEY = 'sp:identity'
/**
 * Identidad de invitado, solo para esta pestaña (sessionStorage). Permite que varias pestañas
 * del mismo navegador entren como participantes distintos: útil para demos y pruebas locales
 * (`/t/CODIGO?guest`).
 */
const TAB_KEY = 'sp:identity:tab'

type Scope = 'local' | 'tab'
let scope: Scope = 'local'

function parseIdentity(raw: string | null): Identity | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Identity>
    if (typeof parsed.id !== 'string' || typeof parsed.secret !== 'string') return null
    return { id: parsed.id, secret: parsed.secret, name: typeof parsed.name === 'string' ? parsed.name : '' }
  } catch {
    return null
  }
}

function safeRead(): Identity | null {
  try {
    const tab = parseIdentity(sessionStorage.getItem(TAB_KEY))
    if (tab) {
      scope = 'tab'
      return tab
    }
  } catch {
    /* sessionStorage no disponible */
  }
  try {
    return parseIdentity(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

function safeWrite(identity: Identity) {
  try {
    if (scope === 'tab') sessionStorage.setItem(TAB_KEY, JSON.stringify(identity))
    else localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    /* almacenamiento no disponible: se mantiene en memoria */
  }
}

function freshIdentity(): Identity {
  return { id: newId(16), secret: newSecret(), name: '' }
}

/** Carga (o crea) la identidad local. Determinista por navegador (o por pestaña si es invitado). */
export function loadIdentity(): Identity {
  const existing = safeRead()
  if (existing) return existing
  const fresh = freshIdentity()
  safeWrite(fresh)
  return fresh
}

interface IdentityStore {
  identity: Identity
  /** true si esta pestaña usa una identidad de invitado propia (sessionStorage). */
  isGuest: boolean
  /** Guarda el nombre localmente. (En mesa, además hay que despachar SET_NAME.) */
  setName: (name: string) => void
  /**
   * Convierte esta pestaña en un invitado con identidad nueva y sin nombre. Idempotente.
   * Debe llamarse ANTES de entrar a una mesa.
   */
  becomeGuest: () => void
}

export const useIdentity = create<IdentityStore>((set, get) => ({
  identity: loadIdentity(),
  isGuest: scope === 'tab',
  setName: (name) => {
    const next = { ...get().identity, name: sanitizeName(name) }
    safeWrite(next)
    set({ identity: next })
  },
  becomeGuest: () => {
    if (get().isGuest) return
    scope = 'tab'
    const fresh = freshIdentity()
    safeWrite(fresh)
    set({ identity: fresh, isGuest: true })
  },
}))
