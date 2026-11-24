// Lays a report's answers out as a table: the page does it in the browser for a live view, and a
// run does it on the server for a copy, with this one function, so the two always agree (B7).
import type { FigureAnswer, FigureColumn } from './reports'

export interface Amount { value: number, currency?: string }
export interface Cell { state: 'ok', amounts: Amount[] }
export type Shown = Cell | { state: 'unavailable', reason: string } | { state: 'unsupported' }
export interface ReportRow { key: string, label: string, sortBy: string | number, cells: Record<string, Shown> }
export type OkAnswer = Extract<FigureAnswer, { state: 'ok' }>

/** Each figure's answers: by the breakdown (null when there is none) and its own total. */
export type Answers = Record<string, { rows: FigureAnswer | null, total: FigureAnswer }>

export interface ReportTable {
  /** The figures shown, in order: those the reader may see. */
  visible: FigureColumn[]
  /** How many were left out because the reader may not see them (M3). */
  hidden: number
  totals: Record<string, Shown>
  rows: ReportRow[]
}

const amountsOf = (rows: OkAnswer['rows']): Amount[] => rows.map(r => ({ value: r.value, ...(r.currency ? { currency: r.currency } : {}) }))

export function toShown(answer: FigureAnswer | null | undefined): Shown {
  if (!answer || answer.state === 'hidden') return { state: 'unavailable', reason: 'hidden' }
  if (answer.state === 'ok') return { state: 'ok', amounts: amountsOf(answer.rows) }
  return answer
}

type Namer = (key: string, answer: OkAnswer) => { label: string, sortBy: string | number }

function addAmounts(row: ReportRow, figureId: string, r: OkAnswer['rows'][number]) {
  const cell = row.cells[figureId] as Cell | undefined
  row.cells[figureId] = { state: 'ok', amounts: [...(cell?.amounts ?? []), ...amountsOf([r])] }
}

function nought(f: FigureColumn, answer: FigureAnswer | null | undefined): Shown {
  return answer && answer.state !== 'ok' ? toShown(answer) : { state: 'ok', amounts: f.unit === 'money' ? [] : [{ value: 0 }] }
}

function rowsByBreakdown(visible: FigureColumn[], answers: Answers, by: string, name: Namer): ReportRow[] {
  const out = new Map<string, ReportRow>()
  for (const f of visible) {
    const answer = answers[f.id]!.rows
    if (answer?.state !== 'ok') continue
    for (const r of answer.rows) {
      const key = r.keys[by] ?? ''
      const row = out.get(key) ?? { key, ...name(key, answer), cells: {} }
      addAmounts(row, f.id, r)
      out.set(key, row)
    }
  }
  for (const row of out.values()) {
    for (const f of visible) row.cells[f.id] ??= nought(f, answers[f.id]!.rows)
  }
  return [...out.values()].sort((a, b) => a.sortBy < b.sortBy ? -1 : a.sortBy > b.sortBy ? 1 : 0)
}

/**
 * The table for `figures` (every readable column) from their answers. `name` gives a row's label
 * and sort order for one key; a figure that answered nothing for a row has nought there, and one
 * that could not answer says so, never nought (REP-08).
 */
export function layOut(figures: FigureColumn[], answers: Answers, by: string | undefined, name: Namer): ReportTable {
  const visible = figures.filter(f => answers[f.id] && answers[f.id]!.total.state !== 'hidden')
  const totals = Object.fromEntries(visible.map(f => [f.id, toShown(answers[f.id]!.total)]))
  const rows = by ? rowsByBreakdown(visible, answers, by, name) : []
  return { visible, hidden: figures.length - visible.length, totals, rows }
}
