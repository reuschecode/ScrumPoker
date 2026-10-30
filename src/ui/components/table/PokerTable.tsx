import { useMemo, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Eye } from 'lucide-react'
import type { TableState } from '@/domain/types'
import { allVoted, connectedParticipants, pendingVoters } from '@/domain/selectors'
import { useTable } from '@/store/hooks'
import { cn } from '@/lib/utils'
import { AdminBar } from './AdminBar'
import { Seat } from './Seat'
import { layoutSeats, orderParticipants } from './seatLayout'
import { useMediaQuery } from './useMediaQuery'
import { plural } from './format'

/** Radios de la elipse de asientos (% del contenedor): los asientos pisan el borde del fieltro. */
const RX = 40
const RY = 31
/** Con más asientos la elipse los solapa: se pasa a la cuadrícula. */
const MAX_OVAL_SEATS = 10
/** Escalonado del volteo al revelar (s por asiento). */
const REVEAL_STAGGER = 0.06

export function PokerTable() {
  const { state, me, isAdmin, participants, dispatch } = useTable()
  const wide = useMediaQuery('(min-width: 640px)')
  const ordered = useMemo(() => orderParticipants(participants, me), [participants, me])
  const positions = useMemo(() => layoutSeats(ordered.length, RX, RY), [ordered.length])
  const oval = wide && ordered.length <= MAX_OVAL_SEATS
  if (!state) return null

  const { round, hostId } = state
  const admins = new Set(state.admins)
  const seats = ordered.map((p, i) => {
    const isHostP = p.id === hostId
    const isAdminP = isHostP || admins.has(p.id)
    return (
      <Seat
        key={p.id}
        participant={p}
        isMe={p.id === me}
        isHostP={isHostP}
        isAdminP={isAdminP}
        vote={Object.hasOwn(round.votes, p.id) ? round.votes[p.id] : undefined}
        revealed={round.revealed}
        canManage={isAdmin && p.id !== me && !isHostP}
        revealDelay={i * REVEAL_STAGGER}
        position={oval ? positions[i] : undefined}
        dispatch={dispatch}
      />
    )
  })
  const center = (
    <>
      <RoundStatus state={state} />
      {isAdmin && <AdminBar />}
    </>
  )

  if (!oval) {
    return (
      <div className="flex flex-col gap-4">
        <div className="relative mx-auto h-56 w-full max-w-2xl">
          <Felt compact>{center}</Felt>
        </div>
        <div role="list" aria-label="Participantes" className="flex flex-wrap justify-center gap-x-1 gap-y-3">
          <AnimatePresence initial={false}>{seats}</AnimatePresence>
        </div>
      </div>
    )
  }

  return (
    <div className="relative mx-auto aspect-[16/10] max-h-[620px] min-h-[420px] w-full max-w-5xl">
      <Felt>{center}</Felt>
      <div role="list" aria-label="Participantes" className="pointer-events-none absolute inset-0">
        <AnimatePresence initial={false}>{seats}</AnimatePresence>
      </div>
    </div>
  )
}

function RoundStatus({ state }: { state: TableState }) {
  const { revealed, votes } = state.round
  const total = connectedParticipants(state).length
  const pending = pendingVoters(state).length
  const votedConnected = Math.max(0, total - pending)
  const voteCount = Object.keys(votes).length
  const done = !revealed && voteCount > 0 && allVoted(state)

  return (
    <div aria-live="polite" className="flex flex-col items-center gap-0.5">
      {revealed ? (
        <p className="flex items-center gap-1.5 text-base font-bold text-ink">
          <Eye className="size-4 text-accent" strokeWidth={1.75} aria-hidden />
          Votos revelados
        </p>
      ) : done ? (
        <p className="text-base font-bold text-mint">¡Todos votaron!</p>
      ) : (
        <p className="text-base font-semibold text-ink">Esperando votos…</p>
      )}
      <p className="tabular text-sm text-ink-2">
        {revealed ? (
          plural(voteCount, 'voto', 'votos')
        ) : (
          <>
            <span className="font-bold text-ink">{votedConnected}</span>/{total} votaron
          </>
        )}
      </p>
    </div>
  )
}

function Felt({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-felt-edge bg-felt',
        'shadow-[inset_0_0_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.08),0_40px_80px_-40px_rgba(0,0,0,0.9)]',
        compact ? 'h-[92%] w-[94%] border-[8px]' : 'h-[58%] w-[70%] border-[10px]',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[50%] bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.10),transparent_60%)]"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center">{children}</div>
    </div>
  )
}
