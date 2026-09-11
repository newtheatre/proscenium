import { z } from 'zod'
import { formatLondon, startOfLondonDay } from './london'
import { pageQuery } from './pagination'
import { isShowNight } from './show-night'

// One declaration per console list derives the endpoint's query schema, the toolbar's builder and
// the chips (K-129, 0032). The server half, whereFrom, is server/utils/list-filters.ts.

export const FILTER_KINDS = ['list', 'search-list', 'date-range', 'number-range', 'yes-no', 'person', 'room', 'show'] as const
export type FilterKind = (typeof FILTER_KINDS)[number]

export const FILTER_OPERATORS = ['is', 'not', 'any', 'between', 'before', 'after', 'empty'] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export type SortDirection = 'asc' | 'desc'

// An "is any of" list binds one parameter per value, so every field has a cap and no statement's
// parameter count grows with the data (0006).
export const DEFAULT_ANY_CAP = 20

// The search box binds one pattern per column; the endpoint names them and may name this many.
export const MAX_SEARCH_COLUMNS = 3

const OPERATORS_FOR: Record<FilterKind, readonly FilterOperator[]> = {
  'list': ['is', 'not', 'any', 'empty'],
  'search-list': ['is', 'not', 'any', 'empty'],
  'person': ['is', 'not', 'any', 'empty'],
  'room': ['is', 'not', 'any', 'empty'],
  'show': ['is', 'not', 'any', 'empty'],
  'date-range': ['is', 'before', 'after', 'between', 'empty'],
  'number-range': ['is', 'before', 'after', 'between', 'empty'],
  'yes-no': ['is'],
}

export interface FilterOption {
  value: string
  label: string
}

export interface FilterField {
  key: string
  label: string
  kind: FilterKind
  // The SQL column, where the field is one. A field without one is answered by the endpoint.
  column?: string
  // A closed list's values. A searchable list or a reference gets its options at runtime.
  options?: readonly FilterOption[]
  // A subset of the kind's operators, never a superset.
  operators?: readonly FilterOperator[]
  cap?: number
  icon?: string
  // A date column holds either a YYYY-MM-DD day or unix seconds; the predicate differs.
  dateAs?: 'day' | 'unix'
  // What a yes-or-no chip says when the answer is no, where "Not ..." would misread.
  negated?: string
}

export interface SortField {
  key: string
  label: string
  column: string
  collate?: 'nocase'
}

export interface ListSpec {
  key: string
  fields: readonly FilterField[]
  // Declared in order: the chosen sort comes first and the rest follow as tiebreaks.
  sort: { fields: readonly SortField[], default: string, direction?: SortDirection }
  search?: { placeholder: string, maxLength?: number }
}

// The keys a declaration written `as const satisfies ListSpec` names, so a page cannot ask for
// a field the declaration does not have.
export type FieldKey<S extends ListSpec> = S['fields'][number]['key']

export interface FilterCondition {
  key: string
  operator: FilterOperator
  values: string[]
}

export function operatorsOf(field: FilterField): readonly FilterOperator[] {
  const allowed = OPERATORS_FOR[field.kind]
  if (!field.operators) return allowed
  for (const operator of field.operators) {
    if (!allowed.includes(operator)) throw new Error(`${field.key}: a ${field.kind} field cannot offer "${operator}"`)
  }
  return field.operators
}

export const capOf = (field: FilterField): number => field.cap ?? DEFAULT_ANY_CAP

export function fieldOf(spec: ListSpec, key: string): FilterField | undefined {
  return spec.fields.find(field => field.key === key)
}

// How many values an operator takes; undefined is "one or more, up to the cap".
export function valuesWanted(operator: FilterOperator): number | undefined {
  if (operator === 'empty') return 0
  if (operator === 'between') return 2
  if (operator === 'any') return undefined
  return 1
}

const NUMBER = /^-?\d+(\.\d+)?$/
const REFERENCE = /^[\w.-]{1,80}$/
const RAW = /^(is|not|any|between|before|after|empty)(?::(.*))?$/s

function valueIssue(field: FilterField, value: string): string | undefined {
  switch (field.kind) {
    case 'list':
      return field.options?.some(option => option.value === value) ? undefined : `"${value}" is not one of the choices`
    case 'yes-no':
      return ['true', 'false', '1', '0'].includes(value) ? undefined : 'takes yes or no'
    case 'date-range':
      // A show night is written as a day, so its validator is the day validator (0014).
      return isShowNight(value) ? undefined : `"${value}" is not a day`
    case 'number-range':
      return NUMBER.test(value) ? undefined : `"${value}" is not a number`
    default:
      return REFERENCE.test(value) ? undefined : 'is not a valid reference'
  }
}

const normalise = (field: FilterField, value: string): string =>
  field.kind === 'yes-no' ? (value === 'true' || value === '1' ? 'true' : 'false') : value

// A URL value is `operator:value[,value]`, or a bare value read as "is" so a plain link works.
export function parseCondition(field: FilterField, raw: string): { condition: FilterCondition } | { issue: string } {
  const match = RAW.exec(raw.trim())
  const operator = (match ? match[1] : 'is') as FilterOperator
  const rest = match ? match[2] : raw.trim()
  if (!operatorsOf(field).includes(operator)) return { issue: `cannot be filtered with "${operator}"` }

  const values = operator === 'empty' ? [] : (rest ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const wanted = valuesWanted(operator)
  if (wanted !== undefined && values.length !== wanted) return { issue: wanted === 0 ? 'takes no value' : `needs ${wanted === 1 ? 'a value' : 'two values'}` }
  if (operator === 'any' && values.length === 0) return { issue: 'needs at least one value' }
  if (operator === 'any' && values.length > capOf(field)) return { issue: `lists at most ${capOf(field)} values` }

  for (const value of values) {
    const issue = valueIssue(field, value)
    if (issue) return { issue }
  }
  if (operator === 'between') {
    const [from, to] = values as [string, string]
    const backwards = field.kind === 'number-range' ? Number(from) > Number(to) : from > to
    if (backwards) return { issue: 'runs backwards' }
  }

  return { condition: { key: field.key, operator, values: values.map(value => normalise(field, value)) } }
}

export function encodeCondition(condition: FilterCondition): string {
  return condition.operator === 'empty' ? 'empty' : `${condition.operator}:${condition.values.join(',')}`
}

function baseSchema(spec: ListSpec) {
  const sortKeys = spec.sort.fields.map(field => field.key) as [string, ...string[]]
  return pageQuery.extend({
    search: z.string().trim().max(spec.search?.maxLength ?? 200).optional().transform(value => value || undefined),
    sort: z.enum(sortKeys).default(spec.sort.default),
    direction: z.enum(['asc', 'desc']).default(spec.sort.direction ?? 'asc'),
  })
}

export type ListQuery = z.output<ReturnType<typeof baseSchema>>

// The endpoint's Zod query on top of the page query: one key per field, read back with
// conditionsOf. Strict, so an obsolete link is refused rather than shown an unfiltered listing.
export function filterQuerySchema(spec: ListSpec): ReturnType<typeof baseSchema> {
  const fields: Record<string, z.ZodType> = {}
  for (const field of spec.fields) {
    fields[field.key] = z.string().optional().transform((raw, context) => {
      if (raw === undefined || raw.trim() === '') return undefined
      const parsed = parseCondition(field, raw)
      if ('issue' in parsed) {
        context.addIssue({ code: 'custom', message: `${field.key} ${parsed.issue}` })
        return z.NEVER
      }
      return parsed.condition
    })
  }
  return baseSchema(spec).extend(fields).strict() as ReturnType<typeof baseSchema>
}

export function conditionsOf(spec: ListSpec, query: object): FilterCondition[] {
  const found: FilterCondition[] = []
  for (const field of spec.fields) {
    const value = (query as Record<string, unknown>)[field.key]
    if (value && typeof value === 'object' && 'operator' in value) found.push(value as FilterCondition)
  }
  return found
}

// The worst case a declaration can bind: paging, the search patterns, and each field at its widest
// operator. A property of the declaration, so a test can hold it under the chunk limit (0006).
export function maxBoundParameters(spec: ListSpec): number {
  const widest = (field: FilterField): number =>
    Math.max(...operatorsOf(field).map(operator => valuesWanted(operator) ?? capOf(field)))
  return 2 + (spec.search ? MAX_SEARCH_COLUMNS : 0) + spec.fields.reduce((sum, field) => sum + widest(field), 0)
}

export function saysOperator(kind: FilterKind, operator: FilterOperator): string {
  switch (operator) {
    case 'is': return 'is'
    case 'not': return 'is not'
    case 'any': return 'is any of'
    case 'between': return 'between'
    case 'before': return kind === 'number-range' ? 'under' : 'before'
    case 'after': return kind === 'number-range' ? 'over' : 'after'
    case 'empty': return 'is empty'
  }
}

export const saysDay = (day: string): string =>
  formatLondon(startOfLondonDay(day), { day: 'numeric', month: 'short', year: 'numeric' })

function saysValue(field: FilterField, value: string, options?: readonly FilterOption[]): string | undefined {
  if (field.kind === 'date-range') return saysDay(value)
  if (field.kind === 'number-range') return value
  return (options ?? field.options)?.find(option => option.value === value)?.label
}

// The chip's text: the field, the operator in words and the values by their labels.
export function saysCondition(field: FilterField, condition: FilterCondition, options?: readonly FilterOption[]): string {
  if (field.kind === 'yes-no') {
    if (condition.values[0] === 'true') return field.label
    return field.negated ?? `Not ${field.label.charAt(0).toLowerCase()}${field.label.slice(1)}`
  }
  if (condition.operator === 'empty') return `${field.label} is empty`
  const named = condition.values.map(value => saysValue(field, value, options))
  if (condition.operator === 'between') return `${field.label} between ${named[0]} and ${named[1]}`
  const words = saysOperator(field.kind, condition.operator)
  if (named.every(Boolean)) return `${field.label} ${words} ${named.join(', ')}`
  // A reference the page has no name for yet, after a refresh: say that rather than print an id.
  return `${field.label} ${words} ${condition.values.length === 1 ? 'chosen' : `${condition.values.length} chosen`}`
}
