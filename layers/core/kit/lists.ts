// The server part of a list (Foundations part 4, "Lists": one declaration in two parts). The shared
// part, defineList in layers/core/shared/list.ts, says what a person can filter, sort and search by;
// the source binds it to a table. A module keeps its sources in server/lists/<name>.ts, each the
// default export of defineListSource, so the migration generator and the checks can find them.
import { DeclarationError } from './refusal'
import { tableMeta, type TableMeta } from './db'
import { searchIndexName } from './search'

export interface ListSourceBinding<Columns extends string> {
  /** The table the list reads, made with defineTable. */
  table: unknown
  /** The columns the search box searches (S1), by their keys in the table. */
  search?: readonly Columns[]
}

export interface ListSource<List = unknown> {
  readonly list: List
  readonly table: TableMeta
  /** Searched columns: key, SQL name. */
  readonly search: readonly { key: string, sql: string }[]
  /** The search index's name, when anything is searched. */
  readonly searchIndex: string | null
}

const SEARCHABLE_CLASSES = new Set(['public', 'internal', 'personal', 'freeText'])

/**
 * Binds a list to its table. A searched column must be text the index may hold: not encrypted, not
 * special and not classed row by row (S2), since the index keeps its words unsealed.
 */
export function defineListSource<List extends { id: string }, T extends { _: { columns: Record<string, unknown> } }>(
  list: List,
  binding: ListSourceBinding<keyof T['_']['columns'] & string> & { table: T },
): ListSource<List> {
  const meta = tableMeta(binding.table)
  const field = (f: string) => `list source ${list.id}: ${f}`
  if (!meta) throw new DeclarationError(field('table'), 'is not a table made with defineTable')
  const search = (binding.search ?? []).map((key) => {
    const column = meta.columns[key]
    if (!column) throw new DeclarationError(field(`search.${key}`), `is not a column of ${meta.name}`)
    if (!SEARCHABLE_CLASSES.has(column.meta.class)) throw new DeclarationError(field(`search.${key}`), `is ${column.meta.class} data, which is never searched`)
    if (column.meta.encrypted) throw new DeclarationError(field(`search.${key}`), 'is encrypted, and the search index would hold its words unsealed')
    return { key, sql: column.sql }
  })
  if (new Set(search.map(s => s.key)).size !== search.length) throw new DeclarationError(field('search'), 'names a column twice')
  return Object.freeze({ list, table: meta, search: Object.freeze(search), searchIndex: search.length ? searchIndexName(meta.name) : null })
}

/** The columns each table's index holds, joining every source that searches it, in a stable order. */
export function searchedTables(sources: readonly ListSource[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>()
  for (const s of sources) {
    if (!s.search.length) continue
    const set = out.get(s.table.name) ?? new Set()
    for (const c of s.search) set.add(c.sql)
    out.set(s.table.name, set)
  }
  return new Map([...out].sort(([a], [b]) => a.localeCompare(b)).map(([t, cols]) => [t, [...cols].sort()]))
}
