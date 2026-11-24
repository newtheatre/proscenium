// Reading figures per person (core.person-measure; Reports rules P1 to P8, R3-27). Only Reports may
// read them, always for a person who holds reports.people.view and the figure's own ability, and every
// read leaves one audit row saying who read which figure for when, and how many rows: never a name or a figure.
import { can, createUnit, isEnabled, log, refuse, useContext, usePoint, useSetting, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import type { MeasureScope, PersonMeasure, PersonMeasureQuery, PersonRow } from '#kit/measures'

export type PersonMeasureAnswer
  = | { state: 'ok', rows: PersonRow[] }
    | { state: 'unavailable', reason: 'module-off' | 'failed' | 'too-slow' | 'bad-answer' }
    | { state: 'unsupported' }

/** The one module that may read figures per person, and the ability its readers need. */
export const PEOPLE_READER = 'reports'
export const PEOPLE_VIEW = 'reports.people.view'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a theatre-local date
const ACCOUNT_ID = /^acc_[A-Za-z0-9]+$/ // not-policy: the shape of an account id
const SCOPE_RECORD: Record<string, string> = { season: 'core.season', production: 'core.production', performance: 'core.performance', venue: 'core.venue', space: 'core.space', collection: 'core.collection' }

const REPORTS_ONLY = () => refuse('core.person-measure.reports-only', 'Figures per person are read only through Reports.', { status: 403 })

function scopeRecord(scope: MeasureScope | undefined): readonly [string, string] | undefined {
  if (!scope) return undefined
  const [kind, id] = Object.entries(scope)[0] ?? []
  const type = kind ? SCOPE_RECORD[kind] : undefined
  return type && typeof id === 'string' && useRegistry().records.has(type) ? [type, id] : undefined
}

function scopeDetail(scope: MeasureScope | undefined): Record<string, string> {
  const [kind, id] = Object.entries(scope ?? {})[0] ?? []
  return kind && typeof id === 'string' ? { scope: kind, scopeId: id } : {}
}

function declaringModule(id: string): string | null {
  for (const entry of useRegistry().modules.values()) {
    if ((entry.manifest.contributes?.['core.person-measure'] ?? []).some(c => c.id === id)) return entry.manifest.id
  }
  return null
}

/** What is wrong with an answer, as a code, or null when each row is an account, the asked key and a number. */
export function badPersonAnswer(query: Pick<PersonMeasureQuery, 'by'>, answer: unknown): string | null {
  const rows = (answer as { rows?: unknown })?.rows
  if (!Array.isArray(rows)) return 'no-rows'
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || typeof row !== 'object') return 'row-not-object'
    for (const field of Object.keys(row)) if (!['person', 'keys', 'value'].includes(field)) return 'row-extra-field'
    if (typeof row.person !== 'string' || !ACCOUNT_ID.test(row.person)) return 'person-not-account'
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) return 'value-not-number'
    const keys = (row.keys ?? {}) as Record<string, unknown>
    if (typeof keys !== 'object') return 'keys-not-object'
    for (const [key, value] of Object.entries(keys)) {
      if (key !== query.by) return 'key-not-asked'
      if (typeof value !== 'string' || value.startsWith('acc_') || value.includes('@')) return 'key-value'
    }
  }
  return null
}

/**
 * Reads one figure per person for Reports. Refused from any other module, without a person, or
 * without both abilities (P1). An answer that is not accounts, keys and numbers is unavailable.
 */
export async function readPersonMeasure(id: string, query: PersonMeasureQuery, actor: Actor): Promise<PersonMeasureAnswer> {
  if (useContext().module !== PEOPLE_READER || !useRegistry().abilities.has(PEOPLE_VIEW)) REPORTS_ONLY()
  if (!actor || actor.kind !== 'person') REPORTS_ONLY()
  const found = (await usePoint<PersonMeasure>('core.person-measure')).find(c => c.id === id)
  if (!found) {
    const module = declaringModule(id)
    if (module && !(await isEnabled(module))) return { state: 'unavailable', reason: 'module-off' }
    refuse('core.measure.unknown', `There is no figure called ${id}.`, { status: 404 })
  }
  const measure = found!.value
  if (query.by && !measure.by.includes(query.by)) refuse('core.measure.unknown-breakdown', `${id} cannot be broken down by ${query.by}.`, { status: 422, fields: { by: query.by } })
  if (!ISO_DATE.test(query.from) || !ISO_DATE.test(query.to) || query.to < query.from) refuse('core.measure.period', 'The period runs from one date to the same or a later one.', { status: 422, fields: { to: 'On or after the start.' } })
  const allowed = (await can(actor, 'reports.people.view' as never)).allowed && (await can(actor, measure.ability as never, scopeRecord(query.scope))).allowed
  if (!allowed) refuse('core.access.denied', 'You do not have permission to see this figure.', { status: 403, remedy: 'Ask an administrator for this permission.' })

  const answer = await readWithin(id, measure, query)
  const unit = createUnit()
  unit.audit({
    action: 'read',
    ability: measure.ability,
    detail: { figure: id, from: query.from, to: query.to, ...scopeDetail(query.scope), ...(query.by ? { by: query.by } : {}), state: answer.state, rows: answer.state === 'ok' ? answer.rows.length : 0 },
  })
  await unit.commit()
  return answer
}

async function readWithin(id: string, measure: PersonMeasure, query: PersonMeasureQuery): Promise<PersonMeasureAnswer> {
  const budgetMs = (await useSetting('core.measures.read-budget') as number) * 1000 // not-policy: seconds to milliseconds
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((resolve) => { timer = setTimeout(() => resolve('late'), budgetMs) })
  let answer: Awaited<ReturnType<PersonMeasure['read']>> | 'late'
  try {
    answer = await Promise.race([measure.read({ from: query.from, to: query.to, ...(query.scope ? { scope: query.scope } : {}), ...(query.by ? { by: query.by } : {}) }), late])
  }
  catch (error) {
    log.warn('core.person-measure.failed', { measure: id, error: (error as Error)?.name })
    return { state: 'unavailable', reason: 'failed' }
  }
  finally {
    clearTimeout(timer)
  }
  if (answer === 'late') {
    log.warn('core.person-measure.too-slow', { measure: id, budgetMs })
    return { state: 'unavailable', reason: 'too-slow' }
  }
  if (answer === 'unsupported') return { state: 'unsupported' }
  const problem = badPersonAnswer(query, answer)
  if (problem) {
    log.error('core.person-measure.bad-answer', { measure: id, problem })
    return { state: 'unavailable', reason: 'bad-answer' }
  }
  return { state: 'ok', rows: answer.rows.map(r => ({ person: r.person, ...(r.keys ? { keys: { ...r.keys } } : {}), value: r.value })) }
}
