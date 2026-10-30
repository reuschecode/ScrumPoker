import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@/domain/types'
import { buildHistoryCsv } from './HistoryPanel'

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  roundId: 'r',
  number: 1,
  story: 'Login',
  finalScore: '5',
  votes: [{ userId: 'a', name: 'Ana', value: '5' }],
  stats: {
    count: 1,
    numericCount: 1,
    average: -1.5,
    median: 5,
    mode: ['5'],
    distribution: [],
    consensus: false,
    suggested: '5',
  },
  finishedAt: 0,
  finishedBy: 'a',
  ...over,
})

describe('buildHistoryCsv', () => {
  it('neutraliza fórmulas en los campos de texto', () => {
    const csv = buildHistoryCsv([
      entry({ story: '=HYPERLINK("x")', finalScore: '@1', votes: [{ userId: 'a', name: '+1', value: '5' }] }),
    ])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain(`"'@1"`)
    expect(csv).toContain(`"'+1: 5"`)
  })

  it('no altera el texto normal ni las columnas numéricas', () => {
    const row = buildHistoryCsv([entry({})]).split('\r\n')[1]
    expect(row).toBe('"1","Login","5","5","-1.5","Ana: 5"')
  })
})
