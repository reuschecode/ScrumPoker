import { useEffect } from 'react'
import type { DomainEvent, TableState, UserId } from '@/domain/types'
import type { TableStore } from '@/store/types'
import { cardNumericValue } from '@/domain/deck'
import { truncate } from '@/lib/utils'
import { eventBus } from '@/store/eventBus'
import { useTableStore } from '@/store/tableStore'
import { toast } from '@/ui/toast/toastStore'

/** Al entrar a la mesa llegan eventos "viejos" (snapshot inicial, re-host): no los anunciamos. */
const WARMUP_MS = 500
const NAME_MAX = 20

function short(name: string): string {
  const clean = name.trim()
  return truncate(clean.length > 0 ? clean : 'Alguien', NAME_MAX)
}

function nameOf(state: TableState, id: UserId, fallback: string): string {
  const p = state.participants.find((x) => x.id === id)
  return p ? short(p.name) : fallback
}

function pointsLabel(score: string): string {
  const n = cardNumericValue(score)
  if (n === null) return score // tallas, '?', '☕' o texto libre: no son puntos
  return n === 1 ? `${score} punto` : `${score} puntos`
}

/**
 * Regla general: nada para mis propias acciones, salvo las que me afectan a mí
 * (recibir/perder admin) y el cierre de ronda, que se anuncia a todos.
 * Los nombres se leen del evento cuando viajan en él; si no, del estado ya actualizado.
 */
function showEventToast(ev: DomainEvent, state: TableState, me: UserId | undefined): void {
  switch (ev.type) {
    case 'participant.joined':
      if (ev.userId !== me) toast.show(`${short(ev.name)} se unió`, { emoji: '👋' })
      return
    case 'participant.left':
      if (ev.userId !== me) toast.show(`${short(ev.name)} salió`)
      return
    case 'participant.kicked':
      // Si me expulsaron, la página ya lo muestra con un overlay.
      if (ev.userId === me || ev.by === me) return
      toast.show(`${nameOf(state, ev.by, 'Un admin')} expulsó a ${short(ev.name)}`, { tone: 'danger' })
      return
    case 'admin.granted':
      if (ev.userId === me) toast.show('Ahora tienes permisos de admin en la mesa', { tone: 'mint', emoji: '🛡️' })
      else if (ev.by !== me) toast.show(`${nameOf(state, ev.userId, 'Alguien')} ahora es admin de la mesa`, { emoji: '🛡️' })
      return
    case 'admin.revoked':
      if (ev.userId === me) toast.show('Ya no tienes permisos de admin', { tone: 'warn' })
      else if (ev.by !== me) toast.show(`${nameOf(state, ev.userId, 'Alguien')} ya no es admin de la mesa`)
      return
    case 'table.renamed':
      if (ev.by !== me) toast.show(`Mesa renombrada: ${ev.name}`, { emoji: '✏️' })
      return
    case 'history.entryUpdated':
      if (ev.by !== me) {
        const { story, finalScore } = ev.changes
        const parts = [
          story && `Historia: ${truncate(story.to || 'Sin nombre', 40)}`,
          finalScore && `Puntaje: ${finalScore.from} → ${finalScore.to}`,
        ].filter(Boolean)
        toast.show(`${nameOf(state, ev.by, 'Un admin')} editó la ronda ${ev.number}`, {
          emoji: '✏️',
          description: parts.join(' · '),
        })
      }
      return
    case 'avatarStyle.changed':
      if (ev.by !== me) toast.show(`${nameOf(state, ev.by, 'Un admin')} cambió los avatares`, { emoji: '🎭' })
      return
    case 'round.finished':
      toast.show(`Ronda ${ev.entry.number} guardada: ${pointsLabel(ev.entry.finalScore)}`, {
        tone: 'mint',
        emoji: '✅',
        description: ev.entry.story ? truncate(ev.entry.story, 60) : undefined,
      })
      return
    case 'round.reset':
      if (ev.by !== me) toast.show('Se reinició la votación')
      return
    default:
      return
  }
}

/** Convierte los eventos de dominio y los errores del store en toasts. Montar una vez en TablePage. */
export function useEventToasts(): void {
  useEffect(() => {
    const mountedAt = Date.now()
    return eventBus.subscribe((events: DomainEvent[], state: TableState) => {
      if (Date.now() - mountedAt < WARMUP_MS) return
      const me = useTableStore.getState().snapshot?.me
      for (const ev of events) showEventToast(ev, state, me)
    })
  }, [])

  useEffect(() => {
    // Se compara `at`: el mismo mensaje puede repetirse y debe volver a mostrarse.
    let lastAt = useTableStore.getState().snapshot?.lastError?.at ?? null
    return useTableStore.subscribe((s: TableStore) => {
      const err = s.snapshot?.lastError
      if (!err || err.at === lastAt) return
      lastAt = err.at
      toast.error(err.message)
    })
  }, [])
}
