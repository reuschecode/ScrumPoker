import { useMemo, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Hourglass, RotateCcw, Sparkles } from 'lucide-react'
import { LIMITS, type Command, type Deck, type TableState } from '@/domain/types'
import { computeStats } from '@/domain/stats'
import { useTable } from '@/store/hooks'
import type { TableView } from '@/store/types'
import { cn } from '@/lib/utils'
import { playSound } from '@/sound'
import { Avatar, Badge, Button, Input, Panel } from '@/ui/primitives'
import { ConfirmDialog } from './ConfirmDialog'
import { formatAverage, formatNames, formatNumber, plural } from './format'
import { SPRING_SOFT, tr } from './motion'

/** Visible para todos tras revelar. Se remonta por ronda (key) para reiniciar el formulario. */
export function ResultsPanel() {
  const { state, deck, isAdmin, dispatch } = useTable()
  if (!state || !deck || !state.round.revealed) return null
  return <ResultsCard key={state.round.id} state={state} deck={deck} isAdmin={isAdmin} dispatch={dispatch} />
}

interface ResultsCardProps {
  state: TableState
  deck: Deck
  isAdmin: boolean
  dispatch: TableView['dispatch']
}

const MAX_AVATARS = 6

function ResultsCard({ state, deck, isAdmin, dispatch }: ResultsCardProps) {
  const reduce = useReducedMotion()
  const votes = state.round.votes
  const stats = useMemo(() => computeStats(votes, deck), [votes, deck])
  const names = useMemo(() => new Map(state.participants.map((p) => [p.id, p.name])), [state.participants])
  // Quien votó y ya salió no está en participants: su nombre viaja en la ronda.
  const departed = state.round.departedNames
  const nameOf = (id: string) =>
    names.get(id) ?? (departed && Object.hasOwn(departed, id) ? departed[id] : 'Alguien que salió')
  const maxCount = Math.max(1, ...stats.distribution.map((d) => d.count))

  const [finalScore, setFinalScore] = useState(() => stats.suggested ?? '')
  const [nextStory, setNextStory] = useState('')
  const [confirmRevote, setConfirmRevote] = useState(false)
  const canSave = finalScore.trim().length > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canSave) return
    const cmd: Command = { type: 'FINISH_ROUND', finalScore: finalScore.trim() }
    const story = nextStory.trim()
    if (story) cmd.nextStory = story
    dispatch(cmd)
  }
  const revote = () => {
    setConfirmRevote(false)
    dispatch({ type: 'RESET_ROUND' })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={tr(reduce, SPRING_SOFT)}>
      <Panel
        glass
        title={`Resultados — Ronda ${state.round.number}`}
        actions={
          stats.consensus ? (
            <Badge tone="mint" icon={<Sparkles strokeWidth={1.75} />}>
              Consenso
            </Badge>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">
          {state.round.story && (
            <p className="truncate text-sm text-ink-2" title={state.round.story}>
              {state.round.story}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Promedio" value={stats.average === null ? '—' : formatAverage(stats.average)} />
            <Stat label="Mediana" value={stats.median === null ? '—' : formatNumber(stats.median)} />
            <Stat label="Moda" value={stats.mode.length > 0 ? stats.mode.join(' · ') : '—'} />
            <Stat
              label="Votos"
              value={String(stats.count)}
              hint={stats.numericCount !== stats.count ? `${stats.numericCount} con número` : undefined}
            />
          </dl>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Distribución</h3>
            {stats.distribution.length === 0 ? (
              <p className="text-sm text-ink-3">Nadie votó en esta ronda.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stats.distribution.map((d, i) => {
                  const voterNames = d.voters.map(nameOf)
                  return (
                    <li
                      key={d.value}
                      className="flex items-center gap-3"
                      title={`${plural(d.count, 'voto', 'votos')}: ${formatNames(voterNames, 8)}`}
                    >
                      <span className="w-9 shrink-0 rounded-md bg-card-face py-1 text-center text-sm font-extrabold text-card-ink">
                        {d.value}
                      </span>
                      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/6" aria-hidden>
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-full bg-accent"
                          style={{ width: `${(d.count / maxCount) * 100}%`, originX: 0 }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={reduce ? { duration: 0 } : { ...SPRING_SOFT, delay: 0.1 + i * 0.06 }}
                        />
                      </div>
                      <span className="tabular w-6 shrink-0 text-right text-sm font-bold text-ink">{d.count}</span>
                      <div className="flex shrink-0 -space-x-2" aria-hidden>
                        {d.voters.slice(0, MAX_AVATARS).map((id) => (
                          <span key={id} title={nameOf(id)}>
                            <Avatar id={id} name={nameOf(id)} size="sm" />
                          </span>
                        ))}
                        {d.voters.length > MAX_AVATARS && (
                          <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-ink-2 ring-2 ring-offset-2 ring-offset-bg ring-line">
                            +{d.voters.length - MAX_AVATARS}
                          </span>
                        )}
                      </div>
                      <span className="sr-only">Votaron: {formatNames(voterNames, 24)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {isAdmin ? (
            <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-line bg-surface/40 p-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span id="final-score-label" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                    Puntaje final
                  </span>
                  {stats.suggested && (
                    <span className="text-xs text-ink-3">
                      Sugerido: <span className="font-bold text-ink-2">{stats.suggested}</span>
                    </span>
                  )}
                </div>
                <div role="group" aria-labelledby="final-score-label" className="flex flex-wrap gap-1.5">
                  {deck.cards.map((card) => {
                    const selected = finalScore === card
                    return (
                      <button
                        key={card}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setFinalScore(card)
                          playSound('click')
                        }}
                        className={cn(
                          'h-9 min-w-9 rounded-md px-2 text-sm font-bold transition-[background-color,color,box-shadow] duration-200',
                          selected
                            ? 'bg-accent text-bg shadow-glow'
                            : 'bg-surface-2 text-ink-2 hover:bg-surface-3 hover:text-ink',
                        )}
                      >
                        {card}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Otro valor"
                  value={finalScore}
                  maxLength={LIMITS.MAX_FINAL_SCORE}
                  placeholder="p. ej. 5"
                  hint="Si el equipo decide un puntaje distinto"
                  autoComplete="off"
                  onChange={(e) => setFinalScore(e.target.value)}
                />
                <Input
                  label="Siguiente historia (opcional)"
                  value={nextStory}
                  maxLength={LIMITS.MAX_STORY}
                  placeholder="¿Qué puntuamos después?"
                  autoComplete="off"
                  onChange={(e) => setNextStory(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  icon={<RotateCcw className="size-4" strokeWidth={1.75} />}
                  onClick={() => setConfirmRevote(true)}
                >
                  Volver a votar
                </Button>
                <Button type="submit" variant="mint" icon={<Check className="size-4" strokeWidth={2} />} disabled={!canSave}>
                  Guardar y nueva ronda
                </Button>
              </div>
            </form>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <Hourglass className="size-4" strokeWidth={1.75} aria-hidden />
              Un admin decidirá el puntaje final
            </p>
          )}
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmRevote}
        title="¿Volver a votar?"
        description="Se descartan los votos revelados sin guardar la ronda en el historial."
        confirmLabel="Volver a votar"
        onConfirm={revote}
        onCancel={() => setConfirmRevote(false)}
      />
    </motion.div>
  )
}

interface StatProps {
  label: string
  value: string
  hint?: string
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="rounded-lg border border-line bg-surface/60 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="tabular truncate text-xl font-extrabold text-ink" title={value}>
        {value}
      </dd>
      {hint && <dd className="text-[11px] text-ink-3">{hint}</dd>}
    </div>
  )
}
