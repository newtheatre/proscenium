// Reads one figure for a report (rule R1): through readMeasure, which checks the figure's own
// ability, its breakdown and the answer. Keys that are records come back with their titles, and a
// performance with its start, so a row can be named by its show and its date.
import { isRefusal, usePoint, type Actor } from '#kit'
import { getPerformance, readMeasure, type RecordResolver } from '#modules/core'
import { measureScope, type ViewQuery } from './ready-made'
import type { FigureAnswer, PageBreakdown } from '../shared/reports'

const RECORD_KEYS: Record<string, string> = { performance: 'core.performance', production: 'core.production', season: 'core.season', venue: 'core.venue' }

export interface FigureQuestion { id: string, from: string, to: string, scope?: ViewQuery['scope'], by?: PageBreakdown }

export async function readFigure(actor: Actor, question: FigureQuestion): Promise<FigureAnswer> {
  let answer
  try {
    answer = await readMeasure(question.id, { from: question.from, to: question.to, by: question.by ? [question.by] : [], scope: measureScope(question.scope) }, actor)
  }
  catch (error) {
    // A figure the reader may not see is left out and counted, never shown as nought (M3).
    if (isRefusal(error) && error.code === 'core.access.denied') return { state: 'hidden' }
    throw error
  }
  if (answer.state !== 'ok') return answer
  const by = question.by
  const values = by ? answer.rows.map(r => r.keys[by]) : []
  const rows = answer.rows.map(r => ({ ...r, keys: Object.fromEntries(Object.entries(r.keys).filter((e): e is [string, string] => e[1] !== undefined)) }))
  return { ...answer, rows, labels: await labelsFor(by, values), ...(by === 'performance' ? { starts: await startsOf(values) } : {}) }
}

async function labelsFor(by: string | undefined, values: (string | undefined)[]): Promise<Record<string, string>> {
  const type = by ? RECORD_KEYS[by] : undefined
  if (!type) return {}
  const resolver = (await usePoint<RecordResolver>('core.record-resolver')).find(r => r.id === type)?.value
  const labels: Record<string, string> = {}
  for (const id of new Set(values.filter((v): v is string => !!v))) {
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
