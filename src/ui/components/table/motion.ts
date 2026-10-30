import type { Transition } from 'framer-motion'

export const SPRING_SOFT: Transition = { type: 'spring', stiffness: 320, damping: 30 }
export const SPRING_POP: Transition = { type: 'spring', stiffness: 420, damping: 26 }
export const SPRING_FLIP: Transition = { type: 'spring', stiffness: 260, damping: 24 }
export const INSTANT: Transition = { duration: 0 }

/** La transición pedida, o una instantánea si el usuario prefiere menos movimiento. */
export function tr(reduce: boolean | null, transition: Transition): Transition {
  return reduce ? INSTANT : transition
}
