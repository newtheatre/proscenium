// Which reads a report needs (R1, M6): each figure by the rows (and the pivot), each row's total,
// each group's total and the grand total, because a distinct or level figure's total is never the
// sum of its parts. The page runs these in the browser and a copy on the server.
import type { FigureAnswers } from './table'
import type { ReportColumn } from './reports'

export interface Read { figure: string, slot: keyof FigureAnswers, by: string[] }

export function readsFor(columns: ReportColumn[], rowsBy: string | undefined, acrossBy: string | undefined): Read[] {
  const out: Read[] = []
  for (const c of columns) {
    if (c.kind !== 'figure' || !c.readable) continue
    out.push({ figure: c.id, slot: 'total', by: [] })
    if (rowsBy) out.push({ figure: c.id, slot: 'rows', by: acrossBy ? [rowsBy, acrossBy] : [rowsBy] })
    if (rowsBy && acrossBy) out.push({ figure: c.id, slot: 'rowTotals', by: [rowsBy] })
    if (acrossBy) out.push({ figure: c.id, slot: 'groupTotals', by: [acrossBy] })
  }
  return out
}

/** The answers gathered into each figure's slots; a slot not read is null. */
export function gather<A>(reads: Read[], answers: A[]): Record<string, { rows: A | null, rowTotals: A | null, groupTotals: A | null, total: A }> {
  const out: Record<string, { rows: A | null, rowTotals: A | null, groupTotals: A | null, total: A }> = {}
  reads.forEach((r, i) => {
    const entry = out[r.figure] ??= { rows: null, rowTotals: null, groupTotals: null, total: undefined as unknown as A }
    entry[r.slot] = answers[i]!
  })
  return out
}
