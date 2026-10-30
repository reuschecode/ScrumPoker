import { Button, Modal } from '@/ui/primitives'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmación breve. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <></>
    </Modal>
  )
}
