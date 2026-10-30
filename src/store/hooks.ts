import { useShallow } from 'zustand/react/shallow'
import type { Participant, UserId } from '@/domain/types'
import { HIDDEN_VOTE } from '@/domain/types'
import { getDeck } from '@/domain/deck'
import { getVote, isAdmin, isHost } from '@/domain/selectors'
import type { ConnectionStatus } from '@/net/protocol'
import { useIdentity } from '@/store/identity'
import { useTableStore } from '@/store/tableStore'
import type { TableView } from '@/store/types'

const NO_PARTICIPANTS: Participant[] = []

/**
 * Vista de la mesa para los componentes. Comparación superficial: solo rerenderiza cuando cambia
 * alguno de los campos (el `state` cambia con cada actualización del host, como es de esperar).
 */
export function useTable(): TableView {
  const identityId = useIdentity((s) => s.identity.id)
  return useTableStore(
    useShallow((s): TableView => {
      const snap = s.snapshot
      const state = snap?.state ?? null
      const me = snap?.me ?? identityId
      const rawVote = state ? getVote(state, me) : null
      return {
        status: snap?.status ?? 'idle',
        state,
        code: snap?.code ?? null,
        me,
        role: snap?.role ?? null,
        isHost: state ? isHost(state, me) : false,
        isAdmin: state ? isAdmin(state, me) : false,
        deck: state ? getDeck(state.deck) : null,
        myVote: rawVote === HIDDEN_VOTE ? null : rawVote,
        participants: state?.participants ?? NO_PARTICIPANTS,
        dispatch: s.dispatch,
        lastError: snap?.lastError ?? null,
      }
    }),
  )
}

/** Un participante concreto; solo rerenderiza si cambia su objeto (p. ej. un asiento). */
export function useParticipant(id: UserId): Participant | undefined {
  return useTableStore((s) => s.snapshot?.state?.participants.find((p) => p.id === id))
}

export function useTableStatus(): ConnectionStatus {
  return useTableStore((s) => s.snapshot?.status ?? 'idle')
}
