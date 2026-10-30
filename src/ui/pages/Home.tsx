import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion'
import { Clock, Crown, Hash, LogIn, Plus, UserRound, Users, X } from 'lucide-react'
import { LIMITS, type DeckId } from '@/domain/types'
import { DECK_LIST } from '@/domain/deck'
import { TransportError } from '@/net/protocol'
import type { RecentTable, TableStore } from '@/store/types'
import { configuredTransport } from '@/lib/env'
import { TABLE_CODE_LENGTH, isValidTableCode, normalizeTableCode } from '@/lib/ids'
import { formatDateTime } from '@/lib/utils'
import { sanitizeName, useIdentity } from '@/store/identity'
import { TableCreationCancelled } from '@/store/tableStore'
import { useTableStore } from '@/store/tableStore'
import { forgetTable, listRecentTables } from '@/store/recentTables'
import { useToastStore } from '@/ui/toast/toastStore'
import { Badge, Button, IconButton, Input, Panel } from '@/ui/primitives'
import { CardFan } from '@/ui/components/shell/CardFan'
import { DeckPicker } from '@/ui/components/shell/DeckPicker'
import { Logo } from '@/ui/components/shell/Logo'
import { PageTransition } from '@/ui/components/shell/PageTransition'

const FEATURES = ['Sin registros', 'Tiempo real', 'Chat y reacciones', 'Historial de rondas']

/** Acepta el código o el enlace completo de la mesa (`…/t/CODIGO?…`). */
function codeFromInput(raw: string): string {
  return normalizeTableCode(raw.match(/\/t\/([^/?#]+)/)?.[1] ?? raw)
}

function describeCreateError(err: unknown): string {
  if (err instanceof TransportError) {
    switch (err.code) {
      case 'code-taken':
        return 'Ese código ya está en uso. Inténtalo de nuevo.'
      case 'unsupported':
        return 'Tu navegador no permite conexiones entre pares (WebRTC).'
      case 'network':
        return 'No hay conexión de red. Revisa tu conexión e inténtalo de nuevo.'
      case 'timeout':
        return 'La conexión tardó demasiado. Inténtalo de nuevo.'
      case 'not-found':
        return 'No se encontró el servicio de conexión.'
    }
  }
  return err instanceof Error && err.message ? err.message : 'Inténtalo de nuevo en unos segundos.'
}

export function Home() {
  const navigate = useNavigate()
  const reduce = useReducedMotion() ?? false
  const identityName = useIdentity((s) => s.identity.name)
  const setIdentityName = useIdentity((s) => s.setName)
  const createTable = useTableStore((s: TableStore) => s.createTable)
  const push = useToastStore((s) => s.push)

  // Crear mesa
  const [createName, setCreateName] = useState(identityName)
  const [tableName, setTableName] = useState('')
  const [deck, setDeck] = useState<DeckId>(DECK_LIST[0]?.id ?? 'fibonacci')
  const [creating, setCreating] = useState(false)
  const [createErrors, setCreateErrors] = useState<{ name?: string; table?: string }>({})

  // Unirse
  const [joinName, setJoinName] = useState(identityName)
  const [joinCode, setJoinCode] = useState('')
  const [joinErrors, setJoinErrors] = useState<{ name?: string; code?: string }>({})

  const createNameRef = useRef<HTMLInputElement>(null)
  const tableNameRef = useRef<HTMLInputElement>(null)
  const joinNameRef = useRef<HTMLInputElement>(null)
  const joinCodeRef = useRef<HTMLInputElement>(null)

  const [recent, setRecent] = useState<RecentTable[]>(() => [...listRecentTables()].sort((a, b) => b.at - a.at))

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (creating) return
    const name = sanitizeName(createName)
    const table = tableName.replace(/\s+/g, ' ').trim().slice(0, LIMITS.MAX_TABLE_NAME)
    const errors: { name?: string; table?: string } = {}
    if (!name) errors.name = 'Escribe tu nombre'
    if (!table) errors.table = 'Ponle un nombre a la mesa'
    setCreateErrors(errors)
    if (errors.name || errors.table) {
      ;(errors.name ? createNameRef : tableNameRef).current?.focus()
      return
    }

    setIdentityName(name)
    setCreating(true)
    try {
      const code = await createTable({ tableName: table, deck })
      navigate(`/t/${code}`)
    } catch (err) {
      setCreating(false)
      if (err instanceof TableCreationCancelled) return
      push({ title: 'No se pudo crear la mesa', description: describeCreateError(err), tone: 'danger' })
    }
  }

  const handleJoin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (creating) return
    const name = sanitizeName(joinName)
    const code = normalizeTableCode(joinCode)
    const errors: { name?: string; code?: string } = {}
    if (!name) errors.name = 'Escribe tu nombre'
    if (!isValidTableCode(code)) errors.code = `El código tiene ${TABLE_CODE_LENGTH} letras o números`
    setJoinErrors(errors)
    if (errors.name || errors.code) {
      ;(errors.name ? joinNameRef : joinCodeRef).current?.focus()
      return
    }

    setIdentityName(name)
    navigate(`/t/${code}`)
  }

  const openRecent = (code: string) => {
    if (!creating) navigate(`/t/${code}`)
  }
  const forget = (code: string) => {
    forgetTable(code)
    setRecent((list) => list.filter((t) => t.code !== code))
  }

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: reduce ? 0 : 0.05 } },
  }
  const item: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
      }

  return (
    <PageTransition className="min-h-dvh">
      <motion.div
        className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Hero */}
        <motion.section
          variants={item}
          className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]"
          aria-labelledby="home-title"
        >
          <div className="flex flex-col items-start gap-5">
            <div className="flex items-center gap-3">
              <Logo withText={false} size={44} />
              <h1 id="home-title" className="text-gradient text-5xl font-extrabold tracking-tight sm:text-6xl">
                Scrum Poker
              </h1>
            </div>
            <p className="max-w-xl text-lg leading-relaxed text-ink-2">
              Puntúa historias de usuario con tu equipo, en tiempo real y sin registros.
            </p>
            <ul className="flex flex-wrap gap-2" aria-label="Características">
              {FEATURES.map((f) => (
                <li key={f}>
                  <Badge tone="neutral">{f}</Badge>
                </li>
              ))}
              {configuredTransport() === 'local' && (
                <li>
                  <Badge tone="warn" title="VITE_TRANSPORT=local: solo pestañas de este navegador">
                    Modo local
                  </Badge>
                </li>
              )}
            </ul>
          </div>
          <CardFan className="lg:justify-self-end" />
        </motion.section>

        {/* Crear / Unirse */}
        <div className="grid gap-6 md:grid-cols-2">
          <motion.div variants={item} className="flex">
            <Panel flush className="w-full">
              <form onSubmit={(e) => void handleCreate(e)} noValidate className="flex h-full flex-col gap-5 p-5 sm:p-6">
                <CardHeading
                  icon={<Plus className="size-5" strokeWidth={1.75} aria-hidden />}
                  title="Crear mesa"
                  description="Tú alojas la mesa: vive en tu navegador y controlas las rondas."
                />
                <Input
                  ref={createNameRef}
                  label="Tu nombre"
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value)
                    if (createErrors.name) setCreateErrors((er) => ({ ...er, name: undefined }))
                  }}
                  maxLength={LIMITS.MAX_NAME}
                  placeholder="Ej. Ana"
                  autoComplete="nickname"
                  icon={<UserRound strokeWidth={1.75} />}
                  error={createErrors.name}
                />
                <Input
                  ref={tableNameRef}
                  label="Nombre de la mesa"
                  value={tableName}
                  onChange={(e) => {
                    setTableName(e.target.value)
                    if (createErrors.table) setCreateErrors((er) => ({ ...er, table: undefined }))
                  }}
                  maxLength={LIMITS.MAX_TABLE_NAME}
                  placeholder="Ej. Sprint 12 · Equipo Atlas"
                  autoComplete="off"
                  icon={<Users strokeWidth={1.75} />}
                  error={createErrors.table}
                />
                <DeckPicker value={deck} onChange={setDeck} />
                <Button
                  type="submit"
                  size="lg"
                  block
                  loading={creating}
                  icon={<Plus className="size-5" strokeWidth={1.75} />}
                  className="mt-auto"
                >
                  {creating ? 'Creando mesa…' : 'Crear mesa'}
                </Button>
              </form>
            </Panel>
          </motion.div>

          <motion.div variants={item} className="flex">
            <Panel flush className="w-full">
              <form onSubmit={handleJoin} noValidate className="flex h-full flex-col gap-5 p-5 sm:p-6">
                <CardHeading
                  icon={<LogIn className="size-5" strokeWidth={1.75} aria-hidden />}
                  title="Unirse a una mesa"
                  description="Pide el código o el enlace a quien creó la mesa."
                />
                <Input
                  ref={joinNameRef}
                  label="Tu nombre"
                  value={joinName}
                  onChange={(e) => {
                    setJoinName(e.target.value)
                    if (joinErrors.name) setJoinErrors((er) => ({ ...er, name: undefined }))
                  }}
                  maxLength={LIMITS.MAX_NAME}
                  placeholder="Ej. Luis"
                  autoComplete="nickname"
                  icon={<UserRound strokeWidth={1.75} />}
                  error={joinErrors.name}
                />
                <Input
                  ref={joinCodeRef}
                  label="Código de mesa"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(codeFromInput(e.target.value))
                    if (joinErrors.code) setJoinErrors((er) => ({ ...er, code: undefined }))
                  }}
                  placeholder="ABC123"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputSize="lg"
                  icon={<Hash strokeWidth={1.75} />}
                  error={joinErrors.code}
                  hint={joinErrors.code ? undefined : `${TABLE_CODE_LENGTH} caracteres; da igual mayúsculas o minúsculas`}
                  className="[&_input]:font-mono [&_input]:font-bold [&_input]:uppercase [&_input]:tracking-[0.35em]"
                />
                <Button
                  type="submit"
                  size="lg"
                  block
                  variant="mint"
                  icon={<LogIn className="size-5" strokeWidth={1.75} />}
                  className="mt-auto"
                >
                  Entrar
                </Button>
              </form>
            </Panel>
          </motion.div>
        </div>

        {/* Mesas recientes */}
        {recent.length > 0 && (
          <motion.section variants={item} aria-labelledby="recent-title" className="flex flex-col gap-3">
            <h2 id="recent-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-3">
              <Clock className="size-4" strokeWidth={1.75} aria-hidden />
              Mesas recientes
            </h2>
            <ul className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {recent.map((t) => (
                  <motion.li
                    key={t.code}
                    layout={!reduce}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-1 rounded-full border border-line bg-surface/70 pl-1.5 pr-1 transition-colors hover:border-accent/50"
                  >
                    <button
                      type="button"
                      onClick={() => openRecent(t.code)}
                      title={`Entrar a ${t.name} (${formatDateTime(t.at)})`}
                      className="flex min-w-0 items-center gap-2 rounded-full pl-1 pr-1 text-left"
                    >
                      <span className="tabular font-mono text-xs font-bold tracking-[0.2em] text-accent">{t.code}</span>
                      <span className="max-w-[10rem] truncate text-sm font-semibold text-ink">{t.name}</span>
                      <Badge tone={t.role === 'host' ? 'accent' : 'neutral'} icon={t.role === 'host' ? <Crown aria-hidden /> : undefined}>
                        {t.role === 'host' ? 'Anfitrión' : 'Invitado'}
                      </Badge>
                    </button>
                    <IconButton
                      size="sm"
                      label={`Olvidar la mesa ${t.name}`}
                      icon={<X className="size-3.5" strokeWidth={1.75} />}
                      onClick={() => forget(t.code)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        )}

        <motion.p variants={item} className="text-center text-xs text-ink-3">
          La mesa vive en el navegador de quien la crea: sin cuentas ni servidores. Comparte el código y a puntuar.
        </motion.p>
      </motion.div>
    </PageTransition>
  )
}

interface CardHeadingProps {
  icon: React.ReactNode
  title: string
  description: string
}

function CardHeading({ icon, title, description }: CardHeadingProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
      <div className="min-w-0">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
        <p className="mt-0.5 text-sm text-ink-2">{description}</p>
      </div>
    </div>
  )
}
