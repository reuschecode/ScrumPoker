import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, UserRound } from 'lucide-react'
import { LIMITS } from '@/domain/types'
import { sanitizeName } from '@/store/identity'
import { Button, Input, Modal } from '@/ui/primitives'

export interface NameGateProps {
  open: boolean
  /** Valor inicial del campo (p. ej. el nombre actual al editar). */
  initialName?: string
  /** false (por defecto): puerta no descartable antes de entrar a la mesa. */
  dismissible?: boolean
  title?: string
  description?: string
  confirmLabel?: string
  onConfirm: (name: string) => void
  onClose?: () => void
}

/** Pide (o permite editar) el nombre del usuario. Enter envía; valida que no quede vacío. */
export function NameGate({
  open,
  initialName = '',
  dismissible = false,
  title = '¿Cómo te llamas?',
  description = 'Así te verán los demás en la mesa. Podrás cambiarlo luego.',
  confirmLabel = 'Entrar a la mesa',
  onConfirm,
  onClose,
}: NameGateProps) {
  const formId = useId()
  return (
    <Modal
      open={open}
      onClose={dismissible ? onClose : undefined}
      dismissible={dismissible}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          {dismissible && onClose && (
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button type="submit" form={formId} iconRight={<ArrowRight className="size-4" strokeWidth={1.75} />}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <NameForm id={formId} initialName={initialName} onConfirm={onConfirm} />
    </Modal>
  )
}

interface NameFormProps {
  id: string
  initialName: string
  onConfirm: (name: string) => void
}

// El formulario vive en su propio componente: el Modal lo desmonta al cerrar y así el borrador se reinicia.
function NameForm({ id, initialName, onConfirm }: NameFormProps) {
  const [draft, setDraft] = useState(initialName)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const name = sanitizeName(draft)
    if (!name) {
      setError('Escribe tu nombre para continuar')
      inputRef.current?.focus()
      return
    }
    onConfirm(name)
  }

  return (
    <form id={id} onSubmit={submit} noValidate>
      <Input
        ref={inputRef}
        label="Tu nombre"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(undefined)
        }}
        maxLength={LIMITS.MAX_NAME}
        placeholder="Ej. Ana"
        autoComplete="nickname"
        inputSize="lg"
        icon={<UserRound strokeWidth={1.75} />}
        error={error}
        hint={error ? undefined : `Hasta ${LIMITS.MAX_NAME} caracteres`}
      />
    </form>
  )
}
