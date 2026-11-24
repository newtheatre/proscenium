// One figure, read live for a report page (rule R1): through readMeasure, which checks the figure's
// own ability, its breakdown and the answer. Keys that are records come back with their titles.
import { z } from 'zod'
import { defineRoute, isRefusal, usePoint } from '#kit'
import { getPerformance, readMeasure, type RecordResolver } from '#modules/core'
import { measureScope } from '../../ready-made'
import { breakdownParam, dateParam, scopeParam, scopeRecord } from '../../query'
import type { FigureAnswer } from '../../../shared/reports'

const RECORD_KEYS: Record<string, string> = { performance: 'core.performance', production: 'core.production', season: 'core.season', venue: 'core.venue' }

export default defineRoute({
  ability: 'reports.report.view',
  record: scopeRecord,
  rateLimit: 'default',
  input: z.object({ id: z.string().max(80), from: dateParam, to: dateParam, scope: scopeParam.optional(), by: breakdownParam.optional() }), // not-policy: a figure id's length
}, async (_event, { actor, input }): Promise<FigureAnswer> => {
  let answer
  try {
    answer = await readMeasure(input.id, { from: input.from, to: input.to, by: input.by ? [input.by] : [], scope: measureScope(input.scope) }, actor)
  }
  catch (error) {
    // A figure the reader may not see is left out and counted, never shown as nought (M3).
    if (isRefusal(error) && error.code === 'core.access.denied') return { state: 'hidden' }
    throw error
  }
  if (answer.state !== 'ok') return answer
  const by = input.by
  const values = by ? answer.rows.map(r => r.keys[by]) : []
  const rows = answer.rows.map(r => ({ ...r, keys: Object.fromEntries(Object.entries(r.keys).filter((e): e is [string, string] => e[1] !== undefined)) }))
  return { ...answer, rows, labels: await labelsFor(input.by, values), ...(input.by === 'performance' ? { starts: await startsOf(values) } : {}) }
})

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

/** When each performance starts, so the page names it by its date as well as its show. */
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
