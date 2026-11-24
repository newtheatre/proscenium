// Reading figures (core.measure; Reports spec rules M1 to M11, stories REP-01 and R3-21): the one way
// any module reads another's figure. Core checks the question before the module is asked, checks
// the reader may see it, holds the read to core.measures.read-budget and checks the answer holds
// keys and numbers only, so a figure can be unavailable but never wrong or personal.
import { can, isEnabled, log, refuse, usePoint, useSetting, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import { useAccessProvider } from '#kit/access'
import { isBreakdown, type Measure, type MeasureQuery, type MeasureRow, type MeasureScope } from '#kit/measures'

export type MeasureAnswer
  = | { state: 'ok', rows: MeasureRow[] }
    | { state: 'unavailable', reason: 'module-off' | 'failed' | 'too-slow' | 'bad-answer' }
    | { state: 'unsupported' }

export interface MeasureListing {
  id: string
  module: string
  label: string
  unit: Measure['unit']
  combine: Measure['combine']
  by: string[]
  filters: string[]
  ratio: boolean
  /** The ability that reads it, so a kept copy can be checked again today. */
  ability: string
}

const MAX_BY = 2 // not-policy: rule M5, at most two breakdowns a read
const MAX_FILTER_VALUES = 20 // not-policy: R3-27's fixed bound
const CURRENCY = /^[A-Z]{3}$/ // not-policy: an ISO 4217 code
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a theatre-local date
// An account id in a row would carry a person into an aggregate (M2).
const ACCOUNT_ID = /^acc_/

/** Every figure declared by a module that is on, by id. */
async function figures(): Promise<Map<string, { module: string, measure: Measure }>> {
  const out = new Map<string, { module: string, measure: Measure }>()
  for (const { id, module, value } of await usePoint<Measure>('core.measure')) out.set(id, { module, measure: value })
  return out
}

/** A figure's module, whether on or off, from the registry, so a switched-off figure answers unavailable rather than unknown. */
function declaringModule(id: string): string | null {
  for (const entry of useRegistry().modules.values()) {
    if ((entry.manifest.contributes?.['core.measure'] ?? []).some(c => c.id === id)) return entry.manifest.id
  }
  return null
}

const SCOPE_RECORD: Record<string, string> = { season: 'core.season', production: 'core.production', performance: 'core.performance', venue: 'core.venue', space: 'core.space', collection: 'core.collection' }

function scopeRecord(scope: MeasureScope | undefined): readonly [string, string] | undefined {
  if (!scope) return undefined
  const [kind, id] = Object.entries(scope)[0] ?? []
  const type = kind ? SCOPE_RECORD[kind] : undefined
  return type && typeof id === 'string' && useRegistry().records.has(type) ? [type, id] : undefined
}

/**
 * Whether the reader may see a figure: its ability site-wide, or on the scope record (a grant on a
 * production reads that production's figures and its performances'; a season needs more) (M3).
 */
export async function mayReadMeasure(measure: Measure, scope: MeasureScope | undefined, actor: Actor): Promise<boolean> {
  return (await can(actor, measure.ability as never, scopeRecord(scope))).allowed
}

/**
 * Reads one figure. A question the figure cannot answer (an undeclared breakdown or filter, M5 and
 * M11) and a reader without its ability (M3) are refused before the module is asked. A module that
 * is off, a read that throws or takes too long, and an answer that is not keys and numbers answer
 * unavailable, never nought (M2, M4). With no actor the read is the system's, for a job acting for
 * someone it has already checked.
 */
export async function readMeasure(id: string, query: MeasureQuery, actor?: Actor | null): Promise<MeasureAnswer> {
  const all = await figures()
  const found = all.get(id)
  if (!found) {
    if (declaringModule(id) && !(await isEnabled(declaringModule(id)!))) return { state: 'unavailable', reason: 'module-off' }
    refuse('core.measure.unknown', `There is no figure called ${id}.`, { status: 404 })
  }
  const { measure } = found!
  checkQuestion(id, measure, query)
  if (actor && !(await mayReadMeasure(measure, query.scope, actor))) refuse('core.access.denied', 'You do not have permission to see this figure.', { status: 403, remedy: 'Ask an administrator for this permission.' })
  if (measure.ratio) return readRatio(id, measure, query, all)
  return readOne(id, measure, query)
}

function checkQuestion(id: string, measure: Measure, query: MeasureQuery): void {
  const by = query.by ?? []
  if (by.length > MAX_BY) refuse('core.measure.too-many-breakdowns', `A figure is broken down by at most ${MAX_BY} keys at once.`, { status: 422, fields: { by: `At most ${MAX_BY}.` } })
  for (const key of by) {
    if (!isBreakdown(key) || !measure.by.includes(key)) refuse('core.measure.unknown-breakdown', `${id} cannot be broken down by ${key}.`, { status: 422, fields: { by: key } })
  }
  if (query.filter) {
    if (!(measure.filters ?? []).includes(query.filter.key)) refuse('core.measure.filter-not-declared', `${id} cannot be narrowed by ${query.filter.key}.`, { status: 422, fields: { filter: query.filter.key } })
    const n = query.filter.values?.length ?? 0
    if (n < 1 || n > MAX_FILTER_VALUES) refuse('core.measure.filter-values', `A filter takes 1 to ${MAX_FILTER_VALUES} values.`, { status: 422, fields: { filter: `1 to ${MAX_FILTER_VALUES} values.` } })
  }
  if (!ISO_DATE.test(query.from) || !ISO_DATE.test(query.to) || query.to < query.from) refuse('core.measure.period', 'The period runs from one date to the same or a later one.', { status: 422, fields: { to: 'On or after the start.' } })
}

async function readOne(id: string, measure: Measure, query: MeasureQuery): Promise<MeasureAnswer> {
  const budgetMs = (await useSetting('core.measures.read-budget') as number) * 1000 // not-policy: seconds to milliseconds
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), budgetMs) })
  let answer: Awaited<ReturnType<NonNullable<Measure['read']>>> | 'late'
  try {
    answer = await Promise.race([measure.read!({ ...query, by: query.by ?? [] }), late])
  }
  catch (error) {
    log.warn('core.measure.failed', { measure: id, error: (error as Error)?.name })
    return { state: 'unavailable', reason: 'failed' }
  }
  finally {
    clearTimeout(timer)
  }
  if (answer === 'late') {
    log.warn('core.measure.too-slow', { measure: id, budgetMs })
    return { state: 'unavailable', reason: 'too-slow' }
  }
  if (answer === 'unsupported') return { state: 'unsupported' }
  const problem = badAnswer(measure, query, answer)
  if (problem) {
    // The figure and the rule it broke, never the row (M2).
    log.error('core.measure.bad-answer', { measure: id, problem })
    return { state: 'unavailable', reason: 'bad-answer' }
  }
  return { state: 'ok', rows: answer.rows.map(r => ({ keys: { ...r.keys }, value: r.value, ...(r.currency ? { currency: r.currency } : {}) })) }
}

/** What is wrong with an answer, as a code, or null when it holds only the asked keys and numbers. */
export function badAnswer(measure: Pick<Measure, 'unit'>, query: Pick<MeasureQuery, 'by'>, answer: unknown): string | null {
  const rows = (answer as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) return 'no-rows'
  const asked = new Set<string>(query.by ?? [])
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || typeof row !== 'object') return 'row-not-object'
    for (const field of Object.keys(row)) if (!['keys', 'value', 'currency'].includes(field)) return 'row-extra-field'
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) return 'value-not-number'
    const keys = (row.keys ?? {}) as Record<string, unknown>
    if (typeof keys !== 'object') return 'keys-not-object'
    for (const [key, value] of Object.entries(keys)) {
      if (!asked.has(key)) return 'key-not-asked'
      if (typeof value !== 'string' || ACCOUNT_ID.test(value)) return 'key-value'
    }
    if (measure.unit === 'money' ? !(typeof row.currency === 'string' && CURRENCY.test(row.currency)) : row.currency !== undefined) return 'currency'
  }
  return null
}

/** A ratio, group by group: both figures read side by side, matched on their keys (M6). */
async function readRatio(id: string, measure: Measure, query: MeasureQuery, all: Map<string, { module: string, measure: Measure }>): Promise<MeasureAnswer> {
  const parts = [measure.ratio!.of, measure.ratio!.over].map(part => all.get(part))
  if (parts.some(p => !p)) return { state: 'unavailable', reason: 'module-off' }
  for (const part of parts) checkQuestion(id, part!.measure, query)
  const [of, over] = await Promise.all([readOne(measure.ratio!.of, parts[0]!.measure, query), readOne(measure.ratio!.over, parts[1]!.measure, query)])
  if (of.state !== 'ok') return of
  if (over.state !== 'ok') return over
  const keyOf = (r: MeasureRow) => JSON.stringify(Object.entries(r.keys).sort(([a], [b]) => a.localeCompare(b)))
  const under = new Map(over.rows.map(r => [keyOf(r), r.value]))
  const rows: MeasureRow[] = []
  for (const r of of.rows) {
    const base = under.get(keyOf(r))
    // Over nothing there is no percentage: the group is left out, shown as a dash, never as nought.
    if (base) rows.push({ keys: r.keys, value: (r.value / base) * 100 }) // not-policy: a percentage
  }
  return { state: 'ok', rows }
}

/** The figures the reader may read somewhere, for a catalogue or a builder. With no reader, every figure. */
export async function listMeasures(actor?: Actor | null): Promise<MeasureListing[]> {
  const out: MeasureListing[] = []
  for (const [id, { module, measure }] of await figures()) {
    if (actor && !(await mayReadSomewhere(measure, actor))) continue
    out.push({ id, module, label: measure.label, unit: measure.unit, combine: measure.combine, by: [...measure.by], filters: [...(measure.filters ?? [])], ratio: !!measure.ratio, ability: measure.ability })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

async function mayReadSomewhere(measure: Measure, actor: Actor): Promise<boolean> {
  if ((await can(actor, measure.ability as never)).allowed) return true
  // A grant on one record still lets the reader read that record's figures there.
  const grants = actor.kind === 'person' ? await useAccessProvider().grants!(actor) : []
  return grants.some(g => !!g.record && g.ability === measure.ability)
}
