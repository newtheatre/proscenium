// Reads one figure for a report (rule R1): through readMeasure, which checks the figure's own
// ability, its breakdowns, its filter and the answer. Values of keys that are records come back with
// their titles, a module's own keys with the names it gives them, and a performance with its start.
import { isRefusal, usePoint, type Actor, type Breakdown } from '#kit'
import { getPerformance, readMeasure, type RecordResolver } from '#modules/core'
import { measureScope, type ViewQuery } from './ready-made'
import { keyValues } from './keys'
import { isPageBreakdown, type FigureAnswer } from '../shared/reports'

const RECORD_KEYS: Record<string, string> = { performance: 'core.performance', production: 'core.production', season: 'core.season', venue: 'core.venue', space: 'core.space' }

export interface FigureQuestion {
  id: string
  from: string
  to: string
  scope?: ViewQuery['scope']
  by?: string[]
  filter?: { key: string, values: string[] } | null
}

export async function readFigure(actor: Actor, question: FigureQuestion): Promise<FigureAnswer> {
  const by = question.by ?? []
  let answer
  try {
    answer = await readMeasure(question.id, {
      from: question.from,
      to: question.to,
      by: by as Breakdown[],
      scope: measureScope(question.scope),
      ...(question.filter ? { filter: { key: question.filter.key as Breakdown, values: question.filter.values } } : {}),
    }, actor)
  }
  catch (error) {
    // A figure the reader may not see is left out and counted, never shown as nought (M3).
    if (isRefusal(error) && error.code === 'core.access.denied') return { state: 'hidden' }
    throw error
  }
  if (answer.state !== 'ok') return answer
  const rows = answer.rows.map(r => ({ ...r, keys: Object.fromEntries(Object.entries(r.keys).filter((e): e is [string, string] => e[1] !== undefined)) }))
  const labels: Record<string, string> = {}
  let starts: Record<string, number> | undefined
  for (const key of by) {
    const values = rows.map(r => r.keys[key])
    Object.assign(labels, await labelsFor(key, values))
    if (key === 'performance') starts = await startsOf(values)
  }
  return { ...answer, rows, labels, ...(starts ? { starts } : {}) }
}

/** Names for one key's values: record titles, a module's own names, nothing for days and months. */
export async function labelsFor(key: string, values: (string | undefined)[]): Promise<Record<string, string>> {
  const wanted = new Set(values.filter((v): v is string => !!v))
  const labels: Record<string, string> = {}
  if (!isPageBreakdown(key)) {
    for (const v of await keyValues(key)) if (wanted.has(v.value)) labels[v.value] = v.label
    return labels
  }
  const type = RECORD_KEYS[key]
  if (!type) return labels
  const resolver = (await usePoint<RecordResolver>('core.record-resolver')).find(r => r.id === type)?.value
  for (const id of wanted) {
    const found = await resolver?.resolve(id)
    if (found) labels[id] = found.title
  }
  return labels
}

async function startsOf(ids: (string | undefined)[]): Promise<Record<string, number>> {
  const starts: Record<string, number> = {}
  for (const id of new Set(ids.filter((v): v is string => !!v))) {
    try {
      starts[id] = (await getPerformance(id)).startsAt
    }
    catch (error) {
      if (!isRefusal(error)) throw error
    }
  }
  return starts
}
