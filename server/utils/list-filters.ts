import { and, getTableColumns, sql } from 'drizzle-orm'
// Named rather than auto-imported: `tests/` typechecks this file under Bun (CONTRIBUTING, 0055).
import { MAX_SEARCH_COLUMNS, capOf, conditionsOf, fieldOf } from '#shared/utils/list-filters'
import { endOfLondonDay, startOfLondonDay } from '#shared/utils/london'
import type { Column, SQL, Table } from 'drizzle-orm'
import type { FilterCondition, FilterField, ListQuery, ListSpec, SortDirection, SortField } from '#shared/utils/list-filters'

// The server half of a list declaration (K-129 criterion 5): predicates and an order clause from
// a validated query. A binding names the columns and answers the fields that are not columns.

export type Reference = SQL | Column

export type FieldAnswer = (condition: FilterCondition) => SQL | undefined

export interface ListBinding {
  column?: (name: string) => Reference | undefined
  // The text columns the search box runs over; the endpoint names them (criterion 2).
  search?: Reference[]
  fields?: Record<string, FieldAnswer>
}

export interface ListClause {
  where: SQL | undefined
  orderBy: SQL[]
}

export const seconds = (at: Date): number => Math.floor(at.getTime() / 1000)

const columnsByTable = new Map<Table, Column[]>()

// Columns by their SQL name on a Drizzle table, for a query-builder endpoint.
export function tableColumns(table: Table): (name: string) => Column | undefined {
  let columns = columnsByTable.get(table)
  if (!columns) {
    columns = Object.values(getTableColumns(table))
    columnsByTable.set(table, columns)
  }
  const known = columns
  return name => known.find(column => column.name === name)
}

// Columns through an alias, for an endpoint written in raw SQL (`s.season_id`).
export function aliasColumns(alias: string): (name: string) => SQL {
  return name => sql.raw(`${alias}.${name}`)
}

// A typed percent sign is a character somebody is looking for, not a wildcard.
export function containsPattern(term: string): string {
  return `%${term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

// LIKE folds ASCII case itself; folding in JavaScript first would fold what SQLite's lower()
// cannot, and the two would disagree on a name like Émile.
export function searchAcross(term: string, columns: Reference[]): SQL {
  if (columns.length > MAX_SEARCH_COLUMNS) throw new Error(`search runs over at most ${MAX_SEARCH_COLUMNS} columns (0006)`)
  const pattern = containsPattern(term)
  return sql`(${sql.join(columns.map(column => sql`${column} LIKE ${pattern} ESCAPE '\\'`), sql` OR `)})`
}

export const yes = (condition: FilterCondition): boolean => condition.values[0] === 'true'

// A yes-or-no answered by an expression over other rows: the binding gives the "when" and the
// negation, with its parentheses, lives here.
export function yesNo(when: SQL): FieldAnswer {
  return condition => (yes(condition) ? when : sql`not (${when})`)
}

// Values bound as given: a number or a YYYY-MM-DD day, both of which compare as themselves.
function rangePredicate(condition: FilterCondition, column: Reference, first: unknown, second: unknown): SQL {
  switch (condition.operator) {
    case 'is': return sql`${column} = ${first}`
    case 'before': return sql`${column} < ${first}`
    case 'after': return sql`${column} > ${first}`
    case 'between': return sql`${column} >= ${first} AND ${column} <= ${second}`
    default: return sql`${column} IS NULL`
  }
}

// A unix column against London day boundaries: the day itself lies inside "is" and "between".
function unixDayPredicate(condition: FilterCondition, column: Reference): SQL {
  const [first, second] = condition.values as [string, string]
  const from = (day: string): number => seconds(startOfLondonDay(day))
  const to = (day: string): number => seconds(endOfLondonDay(day))
  switch (condition.operator) {
    case 'is': return sql`${column} >= ${from(first)} AND ${column} <= ${to(first)}`
    case 'before': return sql`${column} < ${from(first)}`
    case 'after': return sql`${column} > ${to(first)}`
    case 'between': return sql`${column} >= ${from(first)} AND ${column} <= ${to(second)}`
    default: return sql`${column} IS NULL`
  }
}

function valuePredicate(condition: FilterCondition, column: Reference): SQL {
  const [first] = condition.values as [string]
  switch (condition.operator) {
    case 'is': return sql`${column} = ${first}`
    // "Is not X" includes a row with no value at all: a human means "not that one".
    case 'not': return sql`(${column} IS NULL OR ${column} <> ${first})`
    case 'any': return sql`${column} IN (${sql.join(condition.values.map(value => sql`${value}`), sql`, `)})`
    default: return sql`${column} IS NULL`
  }
}

function columnPredicate(field: FilterField, condition: FilterCondition, column: Reference): SQL {
  const [first, second] = condition.values
  switch (field.kind) {
    case 'yes-no': return sql`${column} = ${yes(condition) ? 1 : 0}`
    case 'date-range': return field.dateAs === 'unix' ? unixDayPredicate(condition, column) : rangePredicate(condition, column, first, second)
    case 'number-range': return rangePredicate(condition, column, Number(first), Number(second))
    default: return valuePredicate(condition, column)
  }
}

// The direction is one of two literals chosen here, never text spliced into the statement.
function orderTerm(field: SortField, direction: SortDirection, binding: ListBinding): SQL {
  const column = binding.column?.(field.column)
  if (!column) throw new Error(`sort field ${field.key} names a column the binding does not have`)
  const sorted = field.collate === 'nocase' ? sql`${column} collate nocase` : sql`${column}`
  return direction === 'desc' ? sql`${sorted} desc` : sql`${sorted} asc`
}

export function whereFrom(spec: ListSpec, query: ListQuery, binding: ListBinding): ListClause {
  const parts: SQL[] = []
  for (const condition of conditionsOf(spec, query)) {
    const field = fieldOf(spec, condition.key)!
    if (condition.operator === 'any' && condition.values.length > capOf(field)) {
      throw new Error(`${field.key} lists ${condition.values.length} values, over its cap of ${capOf(field)} (0006)`)
    }
    const answer = binding.fields?.[field.key]
    if (answer) {
      const predicate = answer(condition)
      if (predicate) parts.push(predicate)
      continue
    }
    const column = field.column ? binding.column?.(field.column) : undefined
    if (!column) throw new Error(`${field.key} has no column and the binding does not answer it`)
    parts.push(columnPredicate(field, condition, column))
  }
  if (query.search && binding.search?.length) parts.push(searchAcross(query.search, binding.search))

  const chosen = spec.sort.fields.find(field => field.key === query.sort)
    ?? spec.sort.fields.find(field => field.key === spec.sort.default)!
  const orderBy = [
    orderTerm(chosen, query.direction, binding),
    ...spec.sort.fields.filter(field => field !== chosen).map(field => orderTerm(field, 'asc', binding)),
  ]

  return { where: parts.length ? and(...parts) : undefined, orderBy }
}
