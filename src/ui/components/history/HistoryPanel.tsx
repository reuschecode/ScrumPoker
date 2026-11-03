import { memo, useCallback, useId, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Download, History, Pencil } from 'lucide-react'
import { LIMITS, type Command, type HistoryEntry } from '@/domain/types'
import { cardNumericValue } from '@/domain/deck'
import { useTable } from '@/store/hooks'
import { cn, formatTime } from '@/lib/utils'
import { Badge, Button, IconButton, Input } from '@/ui/primitives'

const EMPTY_HISTORY: HistoryEntry[] = []
const EMPTY_CARDS: readonly string[] = []
const SPRING = { type: 'spring', stiffness: 360, damping: 30 } as const

function formatNumber(n: number): string {
  return n.toLocaleString('es', { maximumFractionDigits: 1 })
}

function csvField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

/**
 * Neutraliza fórmulas: entrecomillar no impide que una hoja de cálculo evalúe una celda que empieza
 * por estos caracteres. Solo para texto; las columnas numéricas calculadas no pasan por aquí.
 */
function csvText(value: string): string {
  return /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value
}

/** CSV (RFC 4180, separador coma, CRLF) con las rondas en orden cronológico. */
export function buildHistoryCsv(history: HistoryEntry[]): string {
  const header = ['Ronda', 'Historia', 'Puntaje final', 'Sugerido', 'Promedio', 'Votos']
  const rows = history.map((e) => [
    e.number,
    csvText(e.story),
    csvText(e.finalScore),
    csvText(e.stats.suggested ?? ''),
    e.stats.average === null ? '' : Math.round(e.stats.average * 100) / 100,
    csvText(e.votes.map((v) => `${v.name}: ${v.value}`).join('; ')),
  ])
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')
}

function downloadTextFile(filename: string, content: string, type: string) {
  // BOM para que Excel detecte UTF-8 (emojis como ☕ en los votos).
  const blob = new Blob(['﻿' + content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function HistoryPanel() {
  const { state, code, isAdmin, deck, dispatch } = useTable()
  const cards = deck?.cards ?? EMPTY_CARDS
  const history = state?.history ?? EMPTY_HISTORY
  const reduceMotion = !!useReducedMotion()

  const entries = useMemo(() => [...history].reverse(), [history])
  // null si ninguna ronda tiene puntaje numérico (p. ej. mazo de tallas): no hay total que mostrar.
  const totalPoints = useMemo(
    () =>
      history.reduce((acc: number | null, e: HistoryEntry) => {
        const n = cardNumericValue(e.finalScore)
        return n === null ? acc : (acc ?? 0) + n
      }, null),
    [history],
  )

  const exportCsv = useCallback(() => {
    downloadTextFile(`historial-${code ?? 'mesa'}.csv`, buildHistoryCsv(history), 'text/csv;charset=utf-8')
  }, [code, history])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-xs text-ink-2">
          <span className="tabular font-bold text-ink">{history.length}</span>{' '}
          {history.length === 1 ? 'ronda' : 'rondas'}
          {totalPoints !== null && (
            <>
              <span className="mx-1.5 text-ink-3" aria-hidden>
                ·
              </span>
              <span className="tabular font-bold text-ink">{formatNumber(totalPoints)}</span>{' '}
              {totalPoints === 1 ? 'punto' : 'puntos'}
            </>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download className="size-4" strokeWidth={1.75} aria-hidden />}
          onClick={exportCsv}
          disabled={history.length === 0}
        >
          Exportar CSV
        </Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" aria-label="Rondas cerradas">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <HistoryRow
                key={entry.roundId}
                entry={entry}
                reduceMotion={reduceMotion}
                canEdit={isAdmin}
                cards={cards}
                dispatch={dispatch}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-ink-3">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2">
        <History className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm">Aún no hay rondas cerradas</p>
      <p className="text-xs">Cuando un admin guarde una ronda, aparecerá aquí.</p>
    </div>
  )
}

interface HistoryRowProps {
  entry: HistoryEntry
  reduceMotion: boolean
  /** Admins (incluido el anfitrión) pueden corregir el puntaje final. */
  canEdit: boolean
  cards: readonly string[]
  dispatch: (cmd: Command) => void
}

const HistoryRow = memo(
  function HistoryRow({ entry, reduceMotion, canEdit, cards, dispatch }: HistoryRowProps) {
    const [open, setOpen] = useState(false)
    const [editing, setEditing] = useState(false)
    const isEditing = canEdit && editing
    const votesId = useId()
    const { number, story, finalScore, stats, votes, finishedAt } = entry

    return (
      <motion.li
        layout={!reduceMotion}
        initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className="rounded-lg border border-line bg-surface/60"
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="tabular shrink-0 font-mono text-xs text-ink-3">#{number}</span>
          <div className="min-w-0 flex-1">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                aria-expanded={isEditing}
                title="Editar ronda"
                className="block max-w-full truncate text-left text-sm font-semibold text-ink underline-offset-2 hover:underline"
              >
                {story || <span className="font-normal italic text-ink-3">Sin nombre</span>}
              </button>
            ) : (
              <p className="truncate text-sm font-semibold text-ink" title={story || undefined}>
                {story || <span className="font-normal italic text-ink-3">Sin nombre</span>}
              </p>
            )}
            <p className="truncate text-[11px] text-ink-3">
              sugerido <span className="text-ink-2">{stats.suggested ?? '—'}</span> · promedio{' '}
              <span className="text-ink-2">{stats.average === null ? '—' : formatNumber(stats.average)}</span> ·{' '}
              <time dateTime={new Date(finishedAt).toISOString()} className="tabular">
                {formatTime(finishedAt)}
              </time>
            </p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-expanded={isEditing}
              aria-label={`Puntaje final: ${finalScore}. Editar la ronda ${number}`}
              title="Editar ronda"
              className={cn(
                'tabular group relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg px-2 text-lg font-extrabold text-accent',
                'bg-accent-soft transition-[box-shadow,background-color] duration-200 hover:shadow-glow',
                isEditing && 'shadow-glow',
              )}
            >
              {finalScore}
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-surface-3 text-ink-2 opacity-70 transition-opacity group-hover:opacity-100">
                <Pencil className="size-2.5" strokeWidth={2} aria-hidden />
              </span>
            </button>
          ) : (
            <span className="tabular inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft px-2 text-lg font-extrabold text-accent">
              <span className="sr-only">Puntaje final: </span>
              {finalScore}
            </span>
          )}
          <IconButton
            size="sm"
            label={open ? 'Ocultar votos' : 'Ver votos'}
            aria-expanded={open}
            aria-controls={votesId}
            onClick={() => setOpen((o) => !o)}
            icon={
              <ChevronDown
                className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
                strokeWidth={1.75}
                aria-hidden
              />
            }
          />
        </div>

        <AnimatePresence initial={false}>
          {isEditing && (
            <motion.div
              key="edit"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <EntryEditor
                story={story}
                finalScore={finalScore}
                cards={cards}
                onCancel={() => setEditing(false)}
                onSave={(changes) => {
                  dispatch({ type: 'UPDATE_HISTORY_ENTRY', roundId: entry.roundId, ...changes })
                  setEditing(false)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="votes"
              id={votesId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <ul className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5" aria-label="Votos">
                {votes.length === 0 ? (
                  <li className="text-xs text-ink-3">Sin votos</li>
                ) : (
                  votes.map((v) => (
                    <li key={v.userId}>
                      <Badge>
                        {v.name} · {v.value}
                      </Badge>
                    </li>
                  ))
                )}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.li>
    )
  },
  // Una ronda cerrada no cambia: con el id basta, el resto es defensa barata.
  (a, b) =>
    a.entry.roundId === b.entry.roundId &&
    a.entry.finalScore === b.entry.finalScore &&
    a.entry.story === b.entry.story &&
    a.entry.votes.length === b.entry.votes.length &&
    a.reduceMotion === b.reduceMotion &&
    a.canEdit === b.canEdit &&
    a.cards === b.cards &&
    a.dispatch === b.dispatch,
)

interface EntryEditorProps {
  story: string
  finalScore: string
  cards: readonly string[]
  /** Solo los campos que cambiaron. */
  onSave: (changes: { story?: string; finalScore?: string }) => void
  onCancel: () => void
}

/** Corrige una ronda guardada: su historia y su puntaje final (cartas del mazo o un valor libre corto). */
function EntryEditor({ story, finalScore, cards, onSave, onCancel }: EntryEditorProps) {
  const [storyDraft, setStoryDraft] = useState(story)
  const [scoreDraft, setScoreDraft] = useState(finalScore)
  const cleanStory = storyDraft.trim()
  const cleanScore = scoreDraft.trim()
  const storyChanged = cleanStory !== story
  const scoreChanged = cleanScore !== finalScore
  const canSave = cleanScore.length > 0 && (storyChanged || scoreChanged)

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSave) return
    onSave({
      ...(storyChanged ? { story: cleanStory } : {}),
      ...(scoreChanged ? { finalScore: cleanScore } : {}),
    })
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-col gap-3 border-t border-line px-3 py-2.5"
    >
      <Input
        label="Historia de usuario"
        value={storyDraft}
        onChange={(e) => setStoryDraft(e.target.value)}
        maxLength={LIMITS.MAX_STORY}
        placeholder="Sin nombre"
        autoFocus
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Puntaje final</p>
        <div role="group" aria-label="Cartas del mazo" className="flex flex-wrap gap-1.5">
          {cards.map((card) => {
            const selected = scoreDraft === card
            return (
              <button
                key={card}
                type="button"
                aria-pressed={selected}
                onClick={() => setScoreDraft(card)}
                className={cn(
                  'tabular h-8 min-w-8 rounded-md border px-2 text-sm font-bold transition-colors',
                  selected ? 'border-accent bg-accent text-bg' : 'border-line bg-surface-2 text-ink hover:bg-surface-3',
                )}
              >
                {card}
              </button>
            )
          })}
        </div>
      </div>
      <Input
        label="Otro valor"
        value={scoreDraft}
        onChange={(e) => setScoreDraft(e.target.value)}
        maxLength={LIMITS.MAX_FINAL_SCORE}
        error={cleanScore ? undefined : 'El puntaje final no puede quedar vacío'}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="mint" disabled={!canSave} icon={<Check className="size-4" strokeWidth={1.75} />}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
