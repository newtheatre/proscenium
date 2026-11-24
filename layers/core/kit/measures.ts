// The figures point's contract (core.measure; Reports spec part 2, R3-21, R3-27): a figure a module
// answers about its own records, as aggregates only, so Reports and any other reader line figures
// up without reading another module's tables. One file per figure; its id is `<module>.<file name>`.
import { DeclarationError } from './refusal'

/** Breakdowns any module can answer, and the only ones two modules' figures line up on. */
export const SHARED_BREAKDOWNS = ['performance', 'production', 'season', 'collection', 'venue', 'space', 'day', 'week', 'month', 'committee-year'] as const
export type SharedBreakdown = typeof SHARED_BREAKDOWNS[number]
/** A shared key, or a module's own `<module>.<noun>`. */
export type Breakdown = SharedBreakdown | `${string}.${string}`

export type MeasureScope = { season: string } | { collection: string } | { production: string } | { performance: string } | { venue: string } | { space: string }

export interface MeasureQuery {
  /** Theatre-local dates, both included, counted in operating days. */
  from: string
  to: string
  scope?: MeasureScope
  /** Zero, one or two of the figure's own breakdowns. */
  by: Breakdown[]
  /** One of the figure's declared filter keys, 1 to 20 values. */
  filter?: { key: Breakdown, values: string[] }
}

/** Keys and a number. Never an account, a name or anything a person wrote (M2). */
export interface MeasureRow {
  keys: Partial<Record<Breakdown, string>>
  value: number
  /** For a money figure, the ISO currency of this row's minor units. */
  currency?: string
}

export interface Measure {
  /** A translation key; `<label>.help` would explain it, as the catalogue shows. */
  label: string
  unit: 'count' | 'money' | 'minutes' | 'percent'
  /** sum adds rows; distinct is read again with fewer keys for a total; level is never added across time. */
  combine: 'sum' | 'distinct' | 'level'
  by: Breakdown[]
  /** The keys it narrows by when asked; any other filter is refused before it is called (M11). */
  filters?: Breakdown[]
  /** Needed site-wide, or on the scope record. */
  ability: string
  /** A percentage core works out from two figures, group by group. Such a figure has no read. */
  ratio?: { of: string, over: string }
  read?: (query: MeasureQuery) => Promise<{ rows: MeasureRow[] } | 'unsupported'>
}

const UNITS = ['count', 'money', 'minutes', 'percent']
const COMBINES = ['sum', 'distinct', 'level']
const OWN_KEY = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

/** Whether a breakdown key is shared, or a module's own `<module>.<noun>`. */
export function isBreakdown(key: string): key is Breakdown {
  return (SHARED_BREAKDOWNS as readonly string[]).includes(key) || OWN_KEY.test(key)
}

/**
 * Declares a figure: `export default defineMeasure({...})` in
 * `server/contributions/core.measure/<name>.ts`. Refuses a figure missing its label, unit, combine,
 * breakdowns or ability, with a read and a ratio both or neither, or an unknown key.
 */
export function defineMeasure<M extends Measure>(measure: M): M {
  const fail = (field: string, message: string): never => { throw new DeclarationError(`core.measure.${field}`, message) }
  if (!measure || typeof measure !== 'object') fail('(figure)', 'the default export is defineMeasure({...})')
  if (typeof measure.label !== 'string' || !measure.label) fail('label', 'is a translation key')
  if (!UNITS.includes(measure.unit)) fail('unit', `is one of ${UNITS.join(', ')}`)
  if (!COMBINES.includes(measure.combine)) fail('combine', `is one of ${COMBINES.join(', ')}`)
  if (typeof measure.ability !== 'string' || !measure.ability.includes('.')) fail('ability', 'names the ability a reader needs')
  if (!Array.isArray(measure.by)) fail('by', 'lists the breakdowns it answers, perhaps none')
  for (const key of [...measure.by, ...(measure.filters ?? [])]) if (!isBreakdown(key)) fail('by', `"${key}" is neither a shared breakdown (${SHARED_BREAKDOWNS.join(', ')}) nor a module's own <module>.<noun>`)
  if (measure.ratio) {
    if (measure.read) fail('read', 'a ratio is worked out by core from its two figures, so it has no read')
    if (measure.unit !== 'percent') fail('unit', 'a ratio is a percent')
    if (typeof measure.ratio.of !== 'string' || typeof measure.ratio.over !== 'string') fail('ratio', 'names the figure it is of and the one it is over')
  }
  else if (typeof measure.read !== 'function') fail('read', 'answers the figure, or the figure is a ratio')
  return measure
}
