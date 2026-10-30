import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export interface PageTransitionProps {
  children: ReactNode
  className?: string
}

/** Envoltorio de página: entrada fade+y y salida fade (se encadena con el AnimatePresence de App). */
export function PageTransition({ children, className }: PageTransitionProps) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
