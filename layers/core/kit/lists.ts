// The server part of a list (Foundations part 4, "Lists": one declaration in two parts). The shared
// part, defineList in layers/core/shared/list.ts, says what a person can filter, sort and search by;
// the source binds each of those keys to the table. A module keeps its sources in
// server/lists/<name>.ts, each the default export of defineListSource, so the migration generator
// and the checks can find them. A data route reads its address with readList and nothing else.
import { and, asc, desc, eq, gte, inArray, lt, lte, sql, type SQL } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { getQuery, type H3Event } from 'h3'
import { decodeList, type DatesValue, type FilterKind, type FilterValue, type ListDeclaration } from '../shared/list'
import { DeclarationError, refuse } from './refusal'
import { tableMeta, type TableMeta } from './db'
import { matchedFields, searchIndexName, searchQuery, searchWords } from './search'
import { can } from './access'
import { useContext } from './context'
import { useRegistry } from './registry'
import { useSetting } from './settings-store'
import { instantOfLocal, previousDate } from './clock'
import { theatreTimeZone, today } from './dates'
import type { AbilityName } from './registry-types'

/** The deepest row a page may reach (L5); beyond it the person narrows the list, or exports it. */
export const LIST_MAX_DEPTH = 10_000 // not-policy: the specification's bound on offset paging

type TableColumns<T> = T extends { _: { columns: infer C } } ? keyof C & string : never
type SearchExtras<L> = L extends { search: readonly (infer S)[] } ? S & string : never
/** Every field the search covers: each column of the list and the declaration's extras. */
export type SearchedField<L extends Pick<ListDeclaration, 'columns'>> = (keyof L['columns'] & string) | SearchExtras<L>

/**
 * A filter's binding: the column its value is compared with, or a condition of its own (a child
 * filter is a subquery here, never a list of ids, L4). A grouped filter always writes its own.
 */
export type FilterBinding<C extends string, K extends FilterKind = FilterKind>
  = | (K extends 'grouped' ? never : { column: C })
    | { where: (value: any) => SQL }
/** A sort's columns, and the index that answers it or the most rows the list's filters let it scan (L3). */
export type SortBinding<C extends string>
  = | { columns: readonly [C, ...C[]], index: string }
    | { columns: readonly [C, ...C[]], bounded: number }
/** A searched field's column, with the ability that shows it when the viewer needs one; false for a field that is not text. */
export type SearchBinding<C extends string> = C | { column: C, ability?: AbilityName } | false

export interface ListSourceBinding<L extends ListDeclaration, T> {
  /** The table the list reads, made with defineTable. */
  table: T
  filters: { [K in keyof L['filters']]: FilterBinding<TableColumns<T>, L['filters'][K]['kind']> }
  sorts: { [K in keyof L['sorts']]: SortBinding<TableColumns<T>> }
  search: { [K in SearchedField<L>]: SearchBinding<TableColumns<T>> }
}

interface BoundColumn { key: string, sql: string, timestamp: boolean }

export interface ListSource<L extends ListDeclaration = ListDeclaration> {
  readonly list: L
  readonly table: TableMeta
  /** Searched fields with their columns (S1). A field bound to false is not here. */
  readonly search: readonly { field: string, key: string, sql: string, ability?: string }[]
  /** The search index's name, when anything is searched. */
  readonly searchIndex: string | null
  /** Kept for readList; not for routes. */
  readonly bound: {
    readonly table: unknown
    readonly id: string
    readonly filters: Record<string, { column?: BoundColumn, where?: (value: any) => SQL }>
    readonly sorts: Record<string, { columns: BoundColumn[] }>
  }
}

const SEARCHABLE_CLASSES = new Set(['public', 'internal', 'personal', 'freeText'])

/**
 * Binds a list to its table. Every filter, sort and searched field of the declaration needs a
 * binding, and a binding for a key the declaration lacks does not compile. A searched column must
 * be text the index may hold: not encrypted, not special and not classed row by row (S2), since
 * the index keeps its words unsealed. A sort names an index on the table beginning with its
 * columns, or declares how many rows its scan is bounded to (L3).
 */
export function defineListSource<const L extends ListDeclaration, T extends { _: { columns: Record<string, unknown> } }>(
  list: L,
  binding: ListSourceBinding<L, T>,
): ListSource<L> {
  const meta = tableMeta(binding.table)
  const at = (f: string) => `list source ${list.id}: ${f}`
  if (!meta) throw new DeclarationError(at('table'), 'is not a table made with defineTable')
  const idKey = Object.keys(meta.columns).find(k => meta.columns[k]!.meta.helper === 'id')
  if (!idKey) throw new DeclarationError(at('table'), `${meta.name} has no id column to end each sort with`)
  const column = (where: string, key: string): BoundColumn => {
    const c = meta.columns[key]
    if (!c) throw new DeclarationError(at(where), `"${key}" is not a column of ${meta.name}`)
    return { key, sql: c.sql, timestamp: c.meta.helper === 'timestamp' }
  }
  const sameKeys = (part: string, declared: object, bound: object) => {
    for (const k of Object.keys(declared)) if (!(k in bound)) throw new DeclarationError(at(`${part}.${k}`), 'has no binding')
    for (const k of Object.keys(bound)) if (!(k in declared)) throw new DeclarationError(at(`${part}.${k}`), `is not a ${part.replace(/s$/, '')} of the list`)
  }

  sameKeys('filters', list.filters, binding.filters)
  const filters: ListSource['bound']['filters'] = {}
  for (const [key, b] of Object.entries(binding.filters as Record<string, FilterBinding<string>>)) {
    if ('where' in b) {
      filters[key] = { where: b.where }
      continue
    }
    if (list.filters[key]!.kind === 'grouped') throw new DeclarationError(at(`filters.${key}`), 'is grouped, so it writes its own condition with where')
    const c = column(`filters.${key}`, b.column)
    if (meta.columns[b.column]!.meta.encrypted) throw new DeclarationError(at(`filters.${key}`), 'is encrypted, so no value can be compared with it')
    filters[key] = { column: c }
  }

  sameKeys('sorts', list.sorts, binding.sorts)
  const indexes = getTableConfig(binding.table as any).indexes.map(i => ({ name: i.config.name, columns: i.config.columns.map((c: any) => c.name as string) }))
  const sorts: ListSource['bound']['sorts'] = {}
  for (const [key, b] of Object.entries(binding.sorts as Record<string, SortBinding<string>>)) {
    const columns = b.columns.map(k => column(`sorts.${key}`, k))
    for (const k of b.columns) if (meta.columns[k]!.meta.encrypted) throw new DeclarationError(at(`sorts.${key}`), `${k} is encrypted, so its order means nothing`)
    if ('index' in b) {
      const index = indexes.find(i => i.name === b.index)
      if (!index) throw new DeclarationError(at(`sorts.${key}.index`), `${meta.name} has no index named ${b.index}`)
      if (columns.some((c, n) => index.columns[n] !== c.sql)) throw new DeclarationError(at(`sorts.${key}.index`), `${b.index} does not begin with the sort's columns`)
    }
    else if (!Number.isInteger(b.bounded) || b.bounded < 1) throw new DeclarationError(at(`sorts.${key}.bounded`), 'is the most rows the scan reads, a whole number from 1')
    sorts[key] = { columns }
  }

  const fields = [...Object.keys(list.columns), ...(list.search ?? [])]
  sameKeys('search', Object.fromEntries(fields.map(f => [f, true])), binding.search)
  const search = Object.entries(binding.search as Record<string, SearchBinding<string>>).flatMap(([field, b]) => {
    if (b === false) {
      // An extra is named for the search alone, so leaving it out would search less than the list says.
      if (!(field in list.columns)) throw new DeclarationError(at(`search.${field}`), 'is a search extra; it is bound to a column of this table, since searching a child is not yet available')
      return []
    }
    const { column: key, ability } = typeof b === 'string' ? { column: b, ability: undefined } : b
    const c = meta.columns[key]
    if (!c) throw new DeclarationError(at(`search.${field}`), `"${key}" is not a column of ${meta.name}`)
    if (!SEARCHABLE_CLASSES.has(c.meta.class)) throw new DeclarationError(at(`search.${field}`), `is ${c.meta.class} data, which is never searched`)
    if (c.meta.encrypted) throw new DeclarationError(at(`search.${field}`), 'is encrypted, and the search index would hold its words unsealed')
    if (c.meta.class === 'internal' && (c.meta.erase as string) === 'clear') throw new DeclarationError(at(`search.${field}`), 'is cleared by erasure and never searched')
    return [{ field, key, sql: c.sql, ...(ability ? { ability } : {}) }]
  })

  return Object.freeze({
    list,
    table: meta,
    search: Object.freeze(search),
    searchIndex: search.length ? searchIndexName(meta.name) : null,
    bound: Object.freeze({ table: binding.table, id: idKey, filters, sorts }),
  })
}

/** The columns each table's index holds, joining every source that searches it, in a stable order. */
export function searchedTables(sources: readonly Pick<ListSource, 'table' | 'search'>[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>()
  for (const s of sources) {
    if (!s.search.length) continue
    const set = out.get(s.table.name) ?? new Set()
    for (const c of s.search) set.add(c.sql)
    out.set(s.table.name, set)
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)).map(([t, cols]) => [t, [...cols].sort()]))
}

export interface ListRead<L extends ListDeclaration = ListDeclaration> {
  /** Validated filter values, only those the viewer may use. */
  filters: { [K in keyof L['filters']]?: FilterValue }
  /** Filter keys left out because the viewer lacks the ability (L2); the page removes their chips. */
  dropped: string[]
  /** The search words used, folded. */
  words: string[]
  /** Words left out as too short to search (S3), as typed. */
  ignoredWords: string[]
  /** Every word typed was too short, so the list comes back unsearched. */
  searchTooShort: boolean
  sort: { key: keyof L['sorts'] & string, order: 'asc' | 'desc' }
  view: string | null
  page: number
  size: number
  limit: number
  offset: number
  /** Filters and search as one condition; undefined when there is nothing to narrow by. */
  where: () => SQL | undefined
  /** The sort's columns, then the id, so pages never shuffle (L3). Spread into orderBy. */
  orderBy: () => SQL[]
  /**
   * For each row, the field that matched when a word was found only in a field the page does not
   * show by default (S5): "Matches season: Autumn 2026". Rows carry their values under the list's
   * field keys. Null where the shown fields matched every word, or there was no search.
   */
  matched: <Row extends Record<string, unknown>>(rows: readonly Row[]) => (string | null)[]
  /**
   * The rows with what the page needs beside them. `matched` maps a row's id to the hidden field it
   * matched, for rows that carry an id and their values under the list's field keys.
   */
  answer: <Row extends Record<string, unknown>>(rows: Row[], total: number) => { rows: Row[], total: number, dropped: string[], ignoredWords: string[], searchTooShort: boolean, matched?: Record<string, string> }
}

type Query = Record<string, string | string[] | null | undefined>

/** Reads a list's address from the request. The one way a data route reads it. */
export async function readList<L extends ListDeclaration>(event: H3Event, source: ListSource<L>): Promise<ListRead<L>> {
  return readListQuery(getQuery(event) as Query, source)
}

/** readList for an address already parsed: an export job reads the address it was given. */
export async function readListQuery<L extends ListDeclaration>(query: Query, source: ListSource<L>): Promise<ListRead<L>> {
  const { list, bound } = source
  const actor = useContext().actor ?? { kind: 'anonymous' as const }
  const wanted = new Set<string>([
    ...Object.values(list.filters).map(f => f.ability).filter((a): a is string => !!a),
    ...source.search.map(s => s.ability).filter((a): a is string => !!a),
  ])
  const held = new Set<string>()
  refuseReadAudited(source)
  for (const ability of wanted) if ((await can(actor as any, ability as AbilityName)).allowed) held.add(ability)
  // The theatre's day is read only when a date filter is on, so a list without one works before setup.
  const viewName = (Array.isArray(query.view) ? query.view[0] : query.view) ?? list.defaultView
  const viewFilters = (viewName && list.views?.[viewName]?.filters) || {}
  const hasDates = Object.entries(list.filters).some(([key, f]) => f.kind === 'dates' && (query[key] || viewFilters[key]))
  const day = hasDates ? await today() : '1970-01-01'

  // The site's page size (core.lists.page-size) when the address names none.
  const defaultSize = Number(await useSetting('core.lists.page-size' as never))
  const decoded = decodeList(query, list, { can: a => held.has(a), today: day, defaultSize })
  if (!decoded.ok) refuse('core.list.unknown', decoded.reason, { status: 422, fields: { [decoded.key]: 'core.list.unknown' } })
  const q = (decoded as Extract<typeof decoded, { ok: true }>).value
  if (q.page * q.size > LIST_MAX_DEPTH) refuse('core.list.too-deep', `A list shows its first ${LIST_MAX_DEPTH.toLocaleString('en-GB')} rows.`, { status: 422, remedy: 'Narrow the list with a filter or a search, or export it.' })

  const typed = Array.isArray(query.q) ? query.q[0] : query.q
  const { where: searchWhere, words, ignoredWords, searchTooShort, fields } = searchFor(source, typed ?? undefined, a => held.has(a))
  const zone = hasDates && Object.values(bound.filters).some(f => f.column?.timestamp) ? await theatreTimeZone() : null
  const table = bound.table as any

  const conditions: SQL[] = []
  for (const [key, value] of Object.entries(q.filters as Record<string, FilterValue | undefined>)) {
    if (value === undefined) continue
    const b = bound.filters[key]!
    if (b.where) {
      conditions.push(b.where(value))
      continue
    }
    const c = table[b.column!.key]
    const kind = list.filters[key]!.kind
    if (kind === 'choices') conditions.push(inArray(c, value as string[]))
    else if (kind === 'dates') {
      const { from, to } = value as DatesValue
      if (b.column!.timestamp) {
        if (from) conditions.push(gte(c, instantOfLocal(from, '00:00', zone!)))
        if (to) conditions.push(lt(c, instantOfLocal(previousDate(to, -1), '00:00', zone!)))
      }
      else {
        if (from) conditions.push(gte(c, from))
        if (to) conditions.push(lte(c, to))
      }
    }
    else conditions.push(eq(c, value as string | boolean))
  }
  if (searchWhere) conditions.push(searchWhere)
  const where = conditions.length ? and(...conditions) : undefined

  const sortKey = q.sort.key as keyof L['sorts'] & string
  const direction = q.sort.order === 'desc' ? desc : asc
  const orderBy = [...bound.sorts[sortKey]!.columns.map(c => direction(table[c.key])), asc(table[bound.id])]

  // A field the page does not show by default: a hidden column, or one of the declaration's extras.
  const hidden = (field: string) => !(field in list.columns) || !!list.columns[field]!.hidden
  const matchFields = [...new Set(fields.map(f => f.field))].map(f => ({ key: f, hidden: hidden(f) }))

  return {
    filters: q.filters as ListRead<L>['filters'],
    dropped: q.dropped,
    words,
    ignoredWords,
    searchTooShort,
    sort: { key: sortKey, order: q.sort.order },
    view: q.view,
    page: q.page,
    size: q.size,
    limit: q.size,
    offset: (q.page - 1) * q.size,
    where: () => where,
    orderBy: () => orderBy,
    matched: rows => words.length ? matchedFields(rows as any, words, matchFields as any) : rows.map(() => null),
    answer: (rows, total) => {
      const out = { rows, total, dropped: q.dropped, ignoredWords, searchTooShort }
      if (!words.length) return out
      const fieldsMatched = matchedFields(rows as any, words, matchFields as any)
      const matched: Record<string, string> = {}
      rows.forEach((row, i) => {
        if (fieldsMatched[i] && typeof row.id === 'string') matched[row.id] = fieldsMatched[i]!
      })
      return { ...out, matched }
    },
  }
}

/** A search the formats do not yet allow fails closed (Foundations part 4, Lists). */
function refuseReadAudited(source: ListSource): void {
  const registry = useRegistry()
  for (const s of source.search) {
    if (s.ability && registry.abilities.get(s.ability)?.decl.audit === 'read') throw new Error(`list source ${source.list.id}: searches ${s.field} under ${s.ability}, which is audited on read; such a search is not audited yet`)
  }
}

export interface SearchCondition {
  /** The rows every word matches, in the fields the viewer may see; undefined when nothing is searched. */
  where: SQL | undefined
  words: string[]
  ignoredWords: string[]
  searchTooShort: boolean
}

function searchFor(source: ListSource, text: string | undefined, holds: (ability: string) => boolean): SearchCondition & { fields: ListSource['search'] } {
  const { words, ignoredWords, searchTooShort } = searchWords(text)
  const fields = source.search.filter(s => !s.ability || holds(s.ability))
  if (!words.length) return { where: undefined, words, ignoredWords, searchTooShort, fields }
  const table = source.bound.table as any
  const index = sql.identifier(source.searchIndex ?? 'none')
  const where = fields.length
    ? sql`${table}.rowid IN (SELECT rowid FROM ${index} WHERE ${index} MATCH ${searchQuery(words, [...new Set(fields.map(f => f.sql))])})`
    : sql`0`
  return { where, words, ignoredWords, searchTooShort, fields }
}

/**
 * A list source's search as one condition, outside readList: for a service that finds rows by what
 * a person typed and hands on a subquery (identity's findAccounts). The same index and rules as
 * readList: three letters, folding, every word, no ranking, only fields the viewer may see. `can`
 * says whether the viewer holds an ability; left out, the request's actor is asked.
 */
export async function searchCondition(source: ListSource, text: string, options: { can?: (ability: string) => boolean } = {}): Promise<SearchCondition> {
  refuseReadAudited(source)
  let holds = options.can
  if (!holds) {
    const actor = useContext().actor ?? { kind: 'anonymous' as const }
    const held = new Set<string>()
    for (const ability of new Set(source.search.map(s => s.ability).filter((a): a is string => !!a)))
      if ((await can(actor as any, ability as AbilityName)).allowed) held.add(ability)
    holds = a => held.has(a)
  }
  const { fields: _fields, ...condition } = searchFor(source, text, holds)
  return condition
}
