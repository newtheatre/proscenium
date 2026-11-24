// Lays a report's answers out as a table: the page does it in the browser for a live view, and a
// run does it on the server for a copy, with this one function, so the two always agree (B7). It
// handles a breakdown down the side, a pivot across the top (B2) and formula columns (B3 to B5).
import { evaluate, parseFormula, type ColumnKind, type Value } from './formula'
import type { FigureAnswer, ReportColumn } from './reports'

export interface Amount { value: number, currency?: string }
export interface Cell { state: 'ok', amounts: Amount[] }
export type Shown = Cell | { state: 'unavailable', reason: string } | { state: 'unsupported' }
export type OkAnswer = Extract<FigureAnswer, { state: 'ok' }>

/** A group of columns across the top: one value of the pivot's key, or the totals (value null). */
export interface Group { value: string | null, label: string }

export interface ReportRow { key: string, label: string, sortBy: string | number, cells: Record<string, Shown> }

/** One figure's answers: by the rows (and the pivot), each row's total, each group's total, the grand total. */
export interface FigureAnswers {
  rows: FigureAnswer | null
  rowTotals: FigureAnswer | null
  groupTotals: FigureAnswer | null
  total: FigureAnswer
}
export type Answers = Record<string, FigureAnswers>

export interface ReportTable {
  /** Every column in the report's order; a figure the reader may not see stays, marked, so C-numbers hold. */
  columns: (ReportColumn & { shown: boolean })[]
  groups: Group[]
  rows: ReportRow[]
  totals: Record<string, Shown>
  /** How many figures were left out because the reader may not see them (M3). */
  hidden: number
}

/** The key of a cell: the column's place, and its group's value ('' for the totals group). */
export const cellKey = (column: number, group: string | null) => `${column}|${group ?? ''}`

const amountsOf = (rows: OkAnswer['rows']): Amount[] => rows.map(r => ({ value: r.value, ...(r.currency ? { currency: r.currency } : {}) }))

export function toShown(answer: FigureAnswer | null | undefined): Shown {
  if (!answer || answer.state === 'hidden') return { state: 'unavailable', reason: 'hidden' }
  if (answer.state === 'ok') return { state: 'ok', amounts: amountsOf(answer.rows) }
  return answer
}

/** One cell from an answer: the rows whose keys match, nought where the figure answered nothing there. */
function pick(answer: FigureAnswer | null, unit: ReportColumn['unit'], match: Record<string, string>): Shown {
  if (!answer || answer.state !== 'ok') return toShown(answer)
  const rows = answer.rows.filter(r => Object.entries(match).every(([k, v]) => r.keys[k] === v))
  return { state: 'ok', amounts: rows.length ? amountsOf(rows) : unit === 'money' ? [] : [{ value: 0 }] }
}

/** A cell as a formula's input: one amount, nought for empty money, nothing for two currencies. */
function valueOf(shown: Shown | undefined): Value | null {
  if (!shown || shown.state !== 'ok') return null
  if (shown.amounts.length > 1) return null
  return shown.amounts[0] ?? { value: 0 }
}

function formulaCell(column: Extract<ReportColumn, { kind: 'formula' }>, cells: (Shown | undefined)[], kinds: ColumnKind[], place: number): Shown {
  const value = evaluate(parseFormula(column.formula, place), cells.map(valueOf), kinds)
  return value ? { state: 'ok', amounts: [value] } : { state: 'unavailable', reason: 'no-value' }
}

export interface LayOut {
  rowsBy?: string
  acrossBy?: string
  /** A row's (or a group's) label and sort order for one value of a key. */
  name: (key: string, value: string, answer: OkAnswer) => { label: string, sortBy: string | number }
  totalLabel: string
}

/**
 * The table for `columns` from their answers. A figure that answered nothing for a row has nought
 * there, and one that could not answer says so, never nought (REP-08). Formulas are worked out
 * row by row and on the totals from the totals (B5).
 */
export function layOut(columns: ReportColumn[], answers: Answers, how: LayOut): ReportTable {
  const marked = columns.map(c => ({ ...c, shown: c.kind === 'formula' || (!!answers[c.id] && answers[c.id]!.total.state !== 'hidden') }))
  const kinds: ColumnKind[] = columns.map(c => ({ unit: c.unit, combine: c.kind === 'figure' ? c.combine : 'sum' }))
  const figures = marked.filter(c => c.kind === 'figure') as Extract<typeof marked[number], { kind: 'figure' }>[]

  // The pivot's values, from every figure's answer by the pivot's key, in order.
  const groupNames = new Map<string, { label: string, sortBy: string | number }>()
  if (how.acrossBy) {
    for (const f of figures) {
      const a = answers[f.id]?.groupTotals
      if (a?.state === 'ok') for (const r of a.rows) if (r.keys[how.acrossBy] && !groupNames.has(r.keys[how.acrossBy]!)) groupNames.set(r.keys[how.acrossBy]!, how.name(how.acrossBy, r.keys[how.acrossBy]!, a))
    }
  }
  const groups: Group[] = [...[...groupNames.entries()].sort((a, b) => a[1].sortBy < b[1].sortBy ? -1 : a[1].sortBy > b[1].sortBy ? 1 : 0).map(([value, n]) => ({ value, label: n.label })), { value: null, label: how.totalLabel }]

  const rowNames = new Map<string, { label: string, sortBy: string | number }>()
  if (how.rowsBy) {
    for (const f of figures) {
      const a = how.acrossBy ? answers[f.id]?.rowTotals : answers[f.id]?.rows
      if (a?.state === 'ok') for (const r of a.rows) if (r.keys[how.rowsBy] !== undefined && !rowNames.has(r.keys[how.rowsBy]!)) rowNames.set(r.keys[how.rowsBy]!, how.name(how.rowsBy, r.keys[how.rowsBy]!, a))
    }
  }

  const fill = (cellFor: (column: number, group: string | null) => Shown): Record<string, Shown> => {
    const cells: Record<string, Shown> = {}
    for (const g of groups) {
      const values: (Shown | undefined)[] = []
      columns.forEach((c, i) => {
        const shown = !marked[i]!.shown
          ? { state: 'unavailable', reason: 'hidden' } as Shown
          : c.kind === 'formula' ? formulaCell(c, values, kinds, i) : cellFor(i, g.value)
        values.push(shown)
        cells[cellKey(i, g.value)] = shown
      })
    }
    return cells
  }

  const rows: ReportRow[] = [...rowNames.entries()].map(([key, n]) => ({
    key, ...n,
    cells: fill((i, group) => {
      const c = columns[i]!
      const a = answers[(c as { id: string }).id]!
      if (group === null) return pick(how.acrossBy ? a.rowTotals : a.rows, c.unit, { [how.rowsBy!]: key })
      return pick(a.rows, c.unit, { [how.rowsBy!]: key, [how.acrossBy!]: group })
    }),
  })).sort((a, b) => a.sortBy < b.sortBy ? -1 : a.sortBy > b.sortBy ? 1 : 0)

  const totals = fill((i, group) => {
    const c = columns[i]!
    const a = answers[(c as { id: string }).id]!
    return group === null ? toShown(a.total) : pick(a.groupTotals, c.unit, { [how.acrossBy!]: group })
  })

  return { columns: marked, groups, rows, totals, hidden: marked.filter(c => !c.shown).length }
}
