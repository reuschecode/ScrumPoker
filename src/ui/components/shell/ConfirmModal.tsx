import type { ReactNode } from 'react'
import { Button, Modal } from '@/ui/primitives'

export interface ConfirmModalProps {
  open: boolean
  title: string
  description?: string
  /** Contenido extra bajo la descripción (pistas, avisos). */
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  icon?: ReactNode
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Modal de confirmación genérico; Escape o clic fuera cancelan. */
export function ConfirmModal({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  icon,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} icon={icon} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
