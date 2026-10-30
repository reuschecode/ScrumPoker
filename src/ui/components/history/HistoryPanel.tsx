import { memo, useCallback, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Download, History } from 'lucide-react'
import type { HistoryEntry } from '@/domain/types'
import { cardNumericValue } from '@/domain/deck'
import { useTable } from '@/store/hooks'
import { cn, formatTime } from '@/lib/utils'
import { Badge, Button, IconButton } from '@/ui/primitives'

const EMPTY_HISTORY: HistoryEntry[] = []
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
  const { state, code } = useTable()
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
              <HistoryRow key={entry.roundId} entry={entry} reduceMotion={reduceMotion} />
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
}

const HistoryRow = memo(
  function HistoryRow({ entry, reduceMotion }: HistoryRowProps) {
    const [open, setOpen] = useState(false)
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
            <p className="truncate text-sm font-semibold text-ink" title={story || undefined}>
              {story || <span className="font-normal italic text-ink-3">Sin nombre</span>}
            </p>
            <p className="truncate text-[11px] text-ink-3">
              sugerido <span className="text-ink-2">{stats.suggested ?? '—'}</span> · promedio{' '}
              <span className="text-ink-2">{stats.average === null ? '—' : formatNumber(stats.average)}</span> ·{' '}
              <time dateTime={new Date(finishedAt).toISOString()} className="tabular">
                {formatTime(finishedAt)}
              </time>
            </p>
          </div>
          <span className="tabular inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft px-2 text-lg font-extrabold text-accent">
            <span className="sr-only">Puntaje final: </span>
            {finalScore}
          </span>
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
    a.entry.votes.length === b.entry.votes.length &&
    a.reduceMotion === b.reduceMotion,
)
