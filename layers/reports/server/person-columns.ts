// The figures a people report may offer, and how many it holds side by side (P8). Kept apart from
// people.ts so that saving a report can name them without importing the copies' code.
import type { Actor } from '#kit'
import { listPersonMeasures } from '#modules/core'
import type { FigureColumn } from '../shared/reports'

export const PEOPLE_MAX = 6 // not-policy: rule P8, figures side by side

/** Person figure columns for measure ids, each marked readable or not, or gone when nobody offers it. */
export async function personColumns(ids: string[], actor: Actor): Promise<FigureColumn[]> {
  const all = new Map((await listPersonMeasures(null)).map(m => [m.id, m]))
  const readable = new Set((await listPersonMeasures(actor)).map(m => m.id))
  return ids.map((id) => {
    const m = all.get(id)
    return m
      ? { kind: 'figure', id, label: m.label, unit: m.unit, combine: m.combine, by: m.by, filters: [], readable: readable.has(id) }
      : { kind: 'figure', id, label: 'reports.figure-gone', unit: 'count', combine: 'sum', by: [], filters: [], readable: false, gone: true }
  })
}
