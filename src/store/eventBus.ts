import type { EventBus, EventListener } from '@/store/types'

/**
 * Pub/sub mínimo para eventos de dominio. Un listener que lance no interrumpe a los demás,
 * y se puede (des)suscribir durante una emisión sin romper la iteración.
 */
export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(events, state) {
      if (events.length === 0) return
      for (const listener of [...listeners]) {
        try {
          listener(events, state)
        } catch (err) {
          console.error('[eventBus] un listener falló', err)
        }
      }
    },
  }
}

/** Bus global: las sesiones (host y cliente) publican aquí; sonidos, toasts y animaciones se suscriben. */
export const eventBus: EventBus = createEventBus()
