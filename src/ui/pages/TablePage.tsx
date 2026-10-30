import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DoorClosed } from 'lucide-react'
import { isValidTableCode, normalizeTableCode } from '@/lib/ids'
import { useIdentity } from '@/store/identity'
import { useTable } from '@/store/hooks'
import { useTableStore } from '@/store/tableStore'
import type { TableStore, TableView } from '@/store/types'
import { useSoundEffects } from '@/sound'
import { useToastStore } from '@/ui/toast/toastStore'
import { useEventToasts } from '@/ui/toast/useEventToasts'
import { StoryBar, PokerTable, ResultsPanel, VotingDeck } from '@/ui/components/table'
import { useUnreadChat } from '@/ui/components/chat'
import { ReactionBar } from '@/ui/components/reactions'
import { ConfirmModal } from '@/ui/components/shell/ConfirmModal'
import { Header, HOST_HINT } from '@/ui/components/shell/Header'
import { NameGate } from '@/ui/components/shell/NameGate'
import { PageTransition } from '@/ui/components/shell/PageTransition'
import { SidePanel, type SideTab } from '@/ui/components/shell/SidePanel'
import { ReconnectBanner, StatusOverlay } from '@/ui/components/shell/StatusOverlay'
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/components/shell/useMediaQuery'

/** Tiempo para que el CLOSE_TABLE llegue a los clientes antes de salir. */
const CLOSE_NAVIGATE_DELAY_MS = 600

export function TablePage() {
  const { code: rawCode } = useParams<'code'>()
  const code = normalizeTableCode(rawCode ?? '')
  const valid = isValidTableCode(code)
  const navigate = useNavigate()
  const reduce = useReducedMotion() ?? false

  const identityName = useIdentity((s) => s.identity.name)
  const setIdentityName = useIdentity((s) => s.setName)
  const hasName = identityName.trim().length > 0

  // Modo invitado (`?guest`): identidad propia de esta pestaña, para entrar como otro participante
  // desde el mismo navegador. Debe activarse antes de unirse a la mesa.
  const [searchParams] = useSearchParams()
  const wantsGuest = searchParams.has('guest')
  const isGuest = useIdentity((s) => s.isGuest)
  const becomeGuest = useIdentity((s) => s.becomeGuest)
  const guestPending = wantsGuest && !isGuest
  useEffect(() => {
    if (guestPending) becomeGuest()
  }, [guestPending, becomeGuest])

  const joinTable = useTableStore((s: TableStore) => s.joinTable)
  const leaveTable = useTableStore((s: TableStore) => s.leaveTable)
  const push = useToastStore((s) => s.push)

  const { status, state, isHost, dispatch, lastError }: TableView = useTable()
  const unread = useUnreadChat()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  useSoundEffects()
  useEventToasts()

  // --- Ciclo de vida de la sesión ---------------------------------------------------------------
  // joinedRef guarda el código al que nos unimos; el cleanup difiere el leave con un setTimeout(0):
  // StrictMode vuelve a ejecutar el efecto de inmediato (y cancela el timer), un desmontaje real no.
  const joinedRef = useRef<string | null>(null)
  const leaveTimer = useRef<number | null>(null)

  const leaveNow = useCallback(() => {
    if (leaveTimer.current !== null) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (joinedRef.current === null) return
    joinedRef.current = null
    leaveTable()
  }, [leaveTable])

  useEffect(() => {
    if (!valid || !hasName || guestPending) return
    if (leaveTimer.current !== null) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (joinedRef.current !== code) {
      if (joinedRef.current !== null) leaveTable()
      joinedRef.current = code
      // Si venimos de createTable (Home) la sesión ya está viva para este código: no la reiniciamos.
      const snap = useTableStore.getState().snapshot
      const alreadyLive =
        snap !== null &&
        snap.code === code &&
        (snap.status === 'connected' || snap.status === 'connecting' || snap.status === 'reconnecting')
      if (!alreadyLive) void joinTable(code)
    }
    return () => {
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = null
        if (joinedRef.current === code) {
          joinedRef.current = null
          leaveTable()
        }
      }, 0)
    }
  }, [code, valid, hasName, guestPending, joinTable, leaveTable])

  // --- Avisos por estado -------------------------------------------------------------------------
  useEffect(() => {
    if (status === 'kicked') {
      push({ title: 'Te expulsaron de la mesa', description: 'Un admin te sacó de la mesa.', tone: 'danger', emoji: '🚫' })
    } else if (status === 'closed' && !isHost) {
      // Quien la cerró es el anfitrión: no hace falta avisarle de su propia acción.
      push({ title: 'La mesa fue cerrada', description: 'El anfitrión cerró la mesa.', tone: 'warn', emoji: '🚪' })
    }
  }, [status, isHost, push])

  const tableName = state?.name
  useEffect(() => {
    document.title = `${tableName ?? `Mesa ${code}`} · Scrum Poker`
    return () => {
      document.title = 'Scrum Poker'
    }
  }, [tableName, code])

  // --- Panel lateral -----------------------------------------------------------------------------
  const [panelOpen, setPanelOpen] = useState(false)
  const [tab, setTab] = useState<SideTab>('chat')
  const openChat = useCallback(() => {
    setTab('chat')
    setPanelOpen(true)
  }, [])
  const openHistory = useCallback(() => {
    setTab('history')
    setPanelOpen(true)
  }, [])
  const closePanel = useCallback(() => setPanelOpen(false), [])

  // --- Salir / cerrar mesa -----------------------------------------------------------------------
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    },
    [],
  )

  const [leaving, setLeaving] = useState(false)
  const goHome = useCallback(() => {
    setLeaving(true)
    leaveNow()
    navigate('/')
  }, [leaveNow, navigate])

  const handleLeave = () => {
    if (isHost) setConfirmClose(true)
    else goHome()
  }

  const handleCloseTable = () => {
    if (closing) return
    setClosing(true)
    dispatch({ type: 'CLOSE_TABLE' })
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      goHome()
    }, CLOSE_NAVIGATE_DELAY_MS)
  }

  const handleRetry = () => {
    leaveNow()
    joinedRef.current = code
    void joinTable(code)
  }

  // Con pocos píxeles de alto, los resultados quedan bajo la mesa: se llevan a la vista al revelar.
  const scrollResultsIntoView = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  if (!valid) return <Navigate to="/" replace />

  const revealed = state?.round.revealed ?? false
  const overlayStatus = leaving || closing ? 'connected' : status
  const blocked = overlayStatus !== 'connected' && overlayStatus !== 'reconnecting'

  return (
    <PageTransition className="flex h-dvh flex-col overflow-hidden">
      <Header
        code={code}
        unread={unread}
        isDesktop={isDesktop}
        onOpenChat={openChat}
        onOpenHistory={openHistory}
        onLeave={handleLeave}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <ReconnectBanner visible={status === 'reconnecting' && !leaving} />
          <main
            className="flex min-h-0 flex-1 flex-col"
            aria-busy={status === 'connecting'}
            inert={blocked}
          >
            {state && (
              <>
                {/* Solo esta zona hace scroll: las cartas y las reacciones quedan siempre a la vista. */}
                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
                  <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
                    <StoryBar />
                    <div className="flex flex-1 flex-col justify-center">
                      <PokerTable />
                    </div>
                <AnimatePresence initial={false}>
                  {revealed && (
                    // ResultsPanel ya anima su propia entrada (fade + y); el wrapper solo aporta la salida.
                    <motion.div key="results" ref={scrollResultsIntoView} exit={{ opacity: 0, y: reduce ? 0 : 8, transition: { duration: 0.18 } }}>
                      <ResultsPanel />
                    </motion.div>
                  )}
                </AnimatePresence>
                  </div>
                </div>
                <div className="shrink-0 border-t border-line bg-bg-elev/60 pb-2 pt-1">
                  <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
                    {!revealed && <VotingDeck />}
                    <ReactionBar />
                  </div>
                </div>
              </>
            )}
          </main>
          <StatusOverlay
            status={overlayStatus}
            code={code}
            errorMessage={lastError?.message ?? null}
            onHome={goHome}
            onRetry={handleRetry}
          />
        </div>

        <SidePanel
          open={panelOpen}
          tab={tab}
          unread={unread}
          isDesktop={isDesktop}
          onTabChange={setTab}
          onClose={closePanel}
        />
      </div>

      <NameGate open={!hasName} onConfirm={setIdentityName} />

      <ConfirmModal
        open={confirmClose}
        title="¿Cerrar la mesa?"
        description="Se cerrará la mesa para todos. El historial de esta sesión se perderá."
        confirmLabel="Cerrar mesa"
        tone="danger"
        icon={<DoorClosed className="size-4" strokeWidth={1.75} />}
        loading={closing}
        onConfirm={handleCloseTable}
        onClose={() => setConfirmClose(false)}
      >
        <p className="rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs text-ink-2">
          ¿Solo quieres salir un rato? {HOST_HINT}
        </p>
      </ConfirmModal>
    </PageTransition>
  )
}
