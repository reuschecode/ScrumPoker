import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { History, Info, LogOut, MessageSquare, Smile, Users } from 'lucide-react'
import { AvatarStyleModal } from './AvatarStyleModal'
import { LIMITS } from '@/domain/types'
import { sanitizeTableName } from '@/domain/table'
import { sanitizeName, useIdentity } from '@/store/identity'
import { useTable } from '@/store/hooks'
import type { TableView } from '@/store/types'
import { SoundToggle } from '@/sound'
import { Avatar, Badge, Button, IconButton } from '@/ui/primitives'
import { EditableText } from './EditableText'
import { Logo } from './Logo'
import { NameGate } from './NameGate'
import { ShareCode } from './ShareCode'
import { useMediaQuery } from './useMediaQuery'

export const HOST_HINT = 'Si cierras esta pestaña la mesa se pausa; vuelve con el mismo enlace para reanudarla.'

export interface HeaderProps {
  code: string
  unread: number
  isDesktop: boolean
  onOpenChat: () => void
  onOpenHistory: () => void
  /** Host: abre la confirmación de cierre. Cliente: sale de la mesa. */
  onLeave: () => void
}

export function Header({ code, unread, isDesktop, onOpenChat, onOpenHistory, onLeave }: HeaderProps) {
  const { state, me, isAdmin, isHost, participants, dispatch }: TableView = useTable()
  const identityName = useIdentity((s) => s.identity.name)
  const setIdentityName = useIdentity((s) => s.setName)
  const isSmUp = useMediaQuery('(min-width: 640px)')
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const hintId = useId()
  const [avatarsOpen, setAvatarsOpen] = useState(false)

  const myName = participants.find((p) => p.id === me)?.name ?? identityName
  const connected = participants.filter((p) => p.connected).length
  const tableName = state?.name ?? `Mesa ${code}`
  const roundNumber = state?.round.number
  const leaveLabel = isHost ? 'Cerrar mesa' : 'Salir'
  const participantsLabel = `${connected} de ${participants.length} participantes conectados`

  const renameMe = (raw: string) => {
    const name = sanitizeName(raw)
    if (!name || name === myName) return
    setIdentityName(name)
    dispatch({ type: 'SET_NAME', name })
  }

  const renameTable = (raw: string) => {
    const name = sanitizeTableName(raw)
    if (!name || name === tableName) return
    dispatch({ type: 'SET_TABLE_NAME', name })
  }

  const leaveIcon = <LogOut className="size-4" strokeWidth={1.75} />

  return (
    <header className="glass sticky top-0 z-30 shrink-0 border-b border-line">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Logo withText={false} size={30} className="shrink-0" />

        <div className="flex min-w-0 items-center gap-2">
          <EditableText
            value={tableName}
            editable={isAdmin}
            onSave={renameTable}
            maxLength={LIMITS.MAX_TABLE_NAME}
            label="Editar nombre de la mesa"
            placeholder="Mesa sin nombre"
            textClassName="max-w-[38vw] text-sm font-extrabold tracking-tight text-ink sm:max-w-[16rem] sm:text-base"
          />
          {isMdUp && roundNumber !== undefined && (
            <Badge tone="accent" className="shrink-0">
              Ronda {roundNumber}
            </Badge>
          )}
        </div>

        {isMdUp && <ShareCode code={code} />}

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {isSmUp && (
            <span
              className="tabular inline-flex items-center gap-1 px-2 text-xs font-semibold text-ink-2"
              title={participantsLabel}
              aria-label={participantsLabel}
            >
              <Users className="size-4" strokeWidth={1.75} aria-hidden />
              {connected}
            </span>
          )}

          {isAdmin && (
            <IconButton
              label="Estilo de avatares"
              icon={<Smile className="size-5" strokeWidth={1.75} />}
              onClick={() => setAvatarsOpen(true)}
            />
          )}

          <SoundToggle />

          {!isDesktop && (
            <>
              <span className="relative">
                <IconButton
                  label={unread > 0 ? `Chat (${unread} sin leer)` : 'Chat'}
                  icon={<MessageSquare className="size-5" strokeWidth={1.75} />}
                  onClick={onOpenChat}
                />
                <AnimatePresence>
                  {unread > 0 && (
                    <motion.span
                      key="unread"
                      className="tabular pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-bg"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      aria-hidden
                    >
                      {unread > 99 ? '99+' : unread}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <IconButton
                label="Historial"
                icon={<History className="size-5" strokeWidth={1.75} />}
                onClick={onOpenHistory}
              />
            </>
          )}

          <ProfileChip me={me} name={myName} compact={!isSmUp} onRename={renameMe} />

          {isHost && (
            <>
              <span id={hintId} className="sr-only">
                {HOST_HINT}
              </span>
              {isDesktop && (
                <IconButton
                  label={HOST_HINT}
                  icon={<Info className="size-4" strokeWidth={1.75} />}
                  size="sm"
                  tabIndex={-1}
                />
              )}
            </>
          )}

          {isSmUp ? (
            <Button
              variant={isHost ? 'danger' : 'secondary'}
              size="sm"
              icon={leaveIcon}
              onClick={onLeave}
              aria-describedby={isHost ? hintId : undefined}
            >
              {leaveLabel}
            </Button>
          ) : (
            <IconButton
              label={leaveLabel}
              variant={isHost ? 'danger' : 'ghost'}
              icon={leaveIcon}
              onClick={onLeave}
              aria-describedby={isHost ? hintId : undefined}
            />
          )}
        </div>
      </div>

      {!isMdUp && (
        <div className="flex items-center justify-between gap-2 px-3 pb-2">
          <ShareCode code={code} compact />
          <div className="flex items-center gap-2">
            {roundNumber !== undefined && <Badge tone="accent">Ronda {roundNumber}</Badge>}
            {!isSmUp && (
              <span
                className="tabular inline-flex items-center gap-1 text-xs font-semibold text-ink-2"
                title={participantsLabel}
                aria-label={participantsLabel}
              >
                <Users className="size-4" strokeWidth={1.75} aria-hidden />
                {connected}
              </span>
            )}
          </div>
        </div>
      )}

      <AvatarStyleModal open={isAdmin && avatarsOpen} onClose={() => setAvatarsOpen(false)} />
    </header>
  )
}

interface ProfileChipProps {
  me: string
  name: string
  /** En móvil solo se muestra el avatar; tocarlo abre un modal para editar el nombre. */
  compact: boolean
  onRename: (name: string) => void
}

function ProfileChip({ me, name, compact, onRename }: ProfileChipProps) {
  const [editing, setEditing] = useState(false)

  if (compact) {
    return (
      <>
        <button
          type="button"
          aria-label="Editar tu nombre"
          title="Editar tu nombre"
          onClick={() => setEditing(true)}
          className="rounded-full p-1"
        >
          <Avatar id={me} name={name} size="sm" />
        </button>
        <NameGate
          open={editing}
          dismissible
          initialName={name}
          title="Tu nombre"
          description="Así te ven los demás en la mesa."
          confirmLabel="Guardar"
          onConfirm={(next) => {
            onRename(next)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      </>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface/60 py-0.5 pl-0.5 pr-1.5">
      <Avatar id={me} name={name} size="sm" />
      <EditableText
        value={name}
        editable
        onSave={onRename}
        maxLength={LIMITS.MAX_NAME}
        label="Editar tu nombre"
        sanitize={sanitizeName}
        textClassName="max-w-[9rem] text-sm font-semibold text-ink"
      />
    </div>
  )
}
