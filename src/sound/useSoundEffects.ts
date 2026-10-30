import { useEffect } from 'react'
import type { DomainEvent, TableState, UserId } from '@/domain/types'
import type { SessionSnapshot } from '@/net/protocol'
import type { TableStore } from '@/store/types'
import { eventBus } from '@/store/eventBus'
import { useTableStore } from '@/store/tableStore'
import { installAudioUnlock, playSound } from './engine'
import type { SoundName } from './types'

/** Silencio tras montar y tras el primer snapshot con estado (el `welcome` no debe sonar). */
const WARMUP_MS = 500
/** Ventana para no repetir un sonido que llega por dos vías (evento + cambio de estado). */
const DEDUPE_MS = 1500

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Sonido que corresponde a un evento de dominio visto por `me`; null si no suena. */
export function soundForEvent(ev: DomainEvent, me: UserId | null): SoundName | null {
  switch (ev.type) {
    case 'vote.cast':
      return ev.userId === me ? 'vote' : 'voteOther'
    case 'chat.message':
      return ev.message.userId === me ? null : 'chat'
    case 'participant.kicked':
      return ev.userId === me ? 'kicked' : 'kick'
    case 'admin.granted':
      return ev.userId === me ? 'adminGranted' : 'click'
    case 'participant.joined':
      return 'join'
    case 'participant.left':
      return 'leave'
    case 'reaction':
      return 'reaction'
    case 'round.revealed':
      return 'reveal'
    case 'round.finished':
      return 'newRound'
    case 'avatarStyle.changed':
      return 'click'
    case 'round.reset':
      return 'reset'
    case 'table.closed':
      return 'close'
    default:
      return null
  }
}

function currentSnapshot(): SessionSnapshot | null {
  const store: TableStore = useTableStore.getState()
  return store.snapshot
}

/**
 * Conecta el bus de eventos con el motor de sonido. Montar una vez (en TablePage).
 * También instala el desbloqueo de audio por gesto y suena 'error' cuando cambia `lastError`.
 */
export function useSoundEffects(): void {
  useEffect(() => {
    installAudioUnlock()

    const mountedAt = now()
    const initial = currentSnapshot()
    let armedAt: number | null = initial?.state ? mountedAt : null
    let lastErrorAt: number | null = initial?.lastError?.at ?? null
    let lastStatus = initial?.status ?? null
    const lastPlayed = new Map<SoundName, number>()

    const play = (name: SoundName): void => {
      lastPlayed.set(name, now())
      playSound(name)
    }
    const playOnce = (name: SoundName): void => {
      const last = lastPlayed.get(name)
      if (last !== undefined && now() - last < DEDUPE_MS) return
      play(name)
    }
    const warmingUp = (): boolean => {
      const t = now()
      return armedAt === null || t - armedAt < WARMUP_MS || t - mountedAt < WARMUP_MS
    }

    const unsubscribeEvents = eventBus.subscribe((events: DomainEvent[], _state: TableState) => {
      if (warmingUp()) return
      const me = currentSnapshot()?.me ?? null
      const batch = new Set<SoundName>()
      for (const ev of events) {
        const name = soundForEvent(ev, me)
        if (name) batch.add(name)
      }
      // Un mismo sonido una vez por lote; los de "salida" pasan por playOnce porque
      // también pueden llegar como cambio de estado (kicked/closed) un poco después.
      for (const name of batch) {
        if (name === 'kicked' || name === 'close') playOnce(name)
        else play(name)
      }
    })

    const unsubscribeStore = useTableStore.subscribe((store: TableStore) => {
      const snap = store.snapshot
      if (snap?.state) {
        if (armedAt === null) armedAt = now()
      } else {
        armedAt = null
      }

      const errorAt = snap?.lastError?.at ?? null
      if (errorAt !== null && errorAt !== lastErrorAt && now() - mountedAt >= WARMUP_MS) play('error')
      lastErrorAt = errorAt

      // Respaldo por si el evento no llegó (p. ej. el host cerró la conexión al expulsar).
      const status = snap?.status ?? null
      if (status !== lastStatus && !warmingUp()) {
        if (status === 'kicked') playOnce('kicked')
        else if (status === 'closed') playOnce('close')
      }
      lastStatus = status
    })

    return () => {
      unsubscribeEvents()
      unsubscribeStore()
    }
  }, [])
}
