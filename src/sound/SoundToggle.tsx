import type { ReactElement } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Volume2, VolumeX } from 'lucide-react'
import { IconButton, type IconButtonProps } from '@/ui/primitives'
import { playSound, unlockAudio } from './engine'
import { useSoundSettings } from './settings'

export interface SoundToggleProps {
  size?: IconButtonProps['size']
  variant?: IconButtonProps['variant']
  className?: string
}

/** Botón que silencia/activa los sonidos; al activar suena un 'click' de confirmación. */
export function SoundToggle({ size = 'md', variant = 'ghost', className }: SoundToggleProps): ReactElement {
  const muted = useSoundSettings((s) => s.muted)
  const setMuted = useSoundSettings((s) => s.setMuted)
  const reduceMotion = useReducedMotion()

  const toggle = (): void => {
    unlockAudio() // estamos en un gesto: buen momento para crear/reanudar el contexto
    const next = !muted
    setMuted(next)
    if (!next) playSound('click')
  }

  const Icon = muted ? VolumeX : Volume2
  return (
    <IconButton
      label={muted ? 'Activar sonidos' : 'Silenciar sonidos'}
      size={size}
      variant={variant}
      className={className}
      onClick={toggle}
      icon={
        <motion.span
          key={muted ? 'muted' : 'on'}
          className="inline-flex"
          initial={reduceMotion ? false : { scale: 0.6, opacity: 0, rotate: muted ? 12 : -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
          aria-hidden
        >
          <Icon className="size-5" strokeWidth={1.75} />
        </motion.span>
      }
    />
  )
}
