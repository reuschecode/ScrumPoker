import { useEffect, useState } from 'react'
import { Eye, RotateCcw } from 'lucide-react'
import { pendingVoters } from '@/domain/selectors'
import { useTable } from '@/store/hooks'
import { Button } from '@/ui/primitives'
import { ConfirmDialog } from './ConfirmDialog'
import { formatNames } from './format'

type ConfirmKind = 'reset' | 'revote'

const CONFIRM: Record<ConfirmKind, { title: string; description: string; confirmLabel: string }> = {
  reset: {
    title: '¿Reiniciar la votación?',
    description: 'Se borran los votos de esta ronda y se sigue con la misma historia.',
    confirmLabel: 'Reiniciar',
  },
  revote: {
    title: '¿Volver a votar?',
    description: 'Se descartan los votos revelados sin guardar la ronda en el historial.',
    confirmLabel: 'Volver a votar',
  },
}

/** Acciones de administración en el centro del óvalo. Solo se monta para admins. */
export function AdminBar() {
  const { state, dispatch } = useTable()
  const [kind, setKind] = useState<ConfirmKind>('reset')
  const [confirmOpen, setConfirmOpen] = useState(false)
  // La confirmación vale para la ronda en la que se abrió: si otro admin la cambia, se cierra.
  const roundId = state?.round.id
  const roundRevealed = state?.round.revealed
  useEffect(() => setConfirmOpen(false), [roundId, roundRevealed])
  if (!state) return null

  const { revealed, votes } = state.round
  const voteCount = Object.keys(votes).length
  const missing = revealed ? [] : pendingVoters(state).map((p) => p.name)

  const ask = (k: ConfirmKind) => {
    setKind(k)
    setConfirmOpen(true)
  }
  const reset = () => {
    setConfirmOpen(false)
    dispatch({ type: 'RESET_ROUND' })
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {revealed ? (
        <>
          <p className="text-xs text-ink-2">Decide el puntaje final en el panel de resultados.</p>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="size-4" strokeWidth={1.75} />}
            onClick={() => ask('revote')}
          >
            Volver a votar
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              icon={<Eye className="size-4" strokeWidth={1.75} />}
              disabled={voteCount === 0}
              onClick={() => dispatch({ type: 'REVEAL' })}
            >
              Revelar votos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw className="size-4" strokeWidth={1.75} />}
              disabled={voteCount === 0}
              onClick={() => ask('reset')}
            >
              Reiniciar
            </Button>
          </div>
          {voteCount > 0 && missing.length > 0 && (
            <p className="max-w-64 text-xs text-ink-2">
              Faltan: <span className="font-semibold text-ink">{formatNames(missing)}</span>
            </p>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        {...CONFIRM[kind]}
        onConfirm={reset}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
