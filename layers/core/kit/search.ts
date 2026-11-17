// List search (Foundations part 4, "Lists", rules S1 to S10, settled by proof P-LIST-1). Each searched
// table has one FTS5 index with the trigram tokenizer, named <table>_search, holding no copy of the
// rows (content= the table) and kept by triggers, so every write and every erasure changes it in the
// same statement. secure-delete removes an old value's trigrams at once rather than at a later merge.
// Words under three letters cannot use a trigram index and are left out of the search (S3).

/** A search word's least length, in letters; shorter words are ignored. */
export const SEARCH_MIN_LETTERS = 3 // not-policy: a trigram is three letters
/** Words in one search, beyond which the rest are ignored. */
export const SEARCH_MAX_WORDS = 8 // not-policy: a bound on the query, not a choice a theatre makes

/** Lower case with accents taken off, as the index's remove_diacritics does: "Zoë" and "zoe" match. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export interface SearchWords {
  /** The words searched for, folded, at least three letters each. */
  words: string[]
  /** Words left out because they are under three letters, as typed. */
  ignoredWords: string[]
  /** Something was typed but no word was long enough, so the list comes back unsearched. */
  searchTooShort: boolean
}

/** Splits what was typed into the words to search for. Every word must match, in any field. */
export function searchWords(q: string | undefined): SearchWords {
  const typed = (q ?? '').trim().split(/\s+/).filter(Boolean)
  const words: string[] = []
  const ignoredWords: string[] = []
  for (const word of typed) {
    const folded = foldText(word)
    if ([...folded].length < SEARCH_MIN_LETTERS) ignoredWords.push(word)
    else if (!words.includes(folded) && words.length < SEARCH_MAX_WORDS) words.push(folded)
  }
  return { words, ignoredWords, searchTooShort: typed.length > 0 && words.length === 0 }
}

/**
 * The FTS5 query for the words: each a quoted phrase, all of them required, limited to the columns
 * the viewer may search (S2: a field the viewer may not see is not searched for them).
 */
export function searchQuery(words: readonly string[], columns: readonly string[]): string {
  if (!words.length || !columns.length) throw new Error('searchQuery needs at least one word and one column')
  const phrases = words.map(w => `"${w.replace(/"/g, '""')}"`).join(' AND ')
  return `{${columns.join(' ')}} : (${phrases})`
}

/** The index's name for a table. */
export function searchIndexName(table: string): string {
  return `${table}_search`
}

/** The shadow tables FTS5 keeps beside an index; they belong to the index, not to any module. */
export function searchShadowTables(table: string): string[] {
  const name = searchIndexName(table)
  return ['data', 'idx', 'docsize', 'config'].map(s => `${name}_${s}`)
}

/** Whether a table name is a search index or one of its shadow tables. */
export function isSearchTable(name: string, searchedTables: Iterable<string>): boolean {
  for (const table of searchedTables) {
    if (name === searchIndexName(table) || searchShadowTables(table).includes(name)) return true
  }
  return false
}

const q = (name: string) => `\`${name}\``

/** The statements that remove a table's index and its triggers. The table's rows are untouched. */
export function dropSearchIndexStatements(table: string): string[] {
  const name = searchIndexName(table)
  return [
    `DROP TRIGGER IF EXISTS ${q(`${name}_insert`)};`,
    `DROP TRIGGER IF EXISTS ${q(`${name}_delete`)};`,
    `DROP TRIGGER IF EXISTS ${q(`${name}_update`)};`,
    `DROP TABLE IF EXISTS ${q(name)};`,
  ]
}

/**
 * The statements that make a table's index from nothing: drop what was there, create the index with
 * secure-delete on, add the triggers, and fill it from the table's rows.
 */
export function searchIndexStatements(table: string, columns: readonly string[]): string[] {
  if (!columns.length) throw new Error(`${table}: a search index needs at least one column`)
  const name = searchIndexName(table)
  const cols = columns.map(q).join(', ')
  const values = (row: 'new' | 'old') => columns.map(c => `${row}.${q(c)}`).join(', ')
  return [
    ...dropSearchIndexStatements(table),
    `CREATE VIRTUAL TABLE ${q(name)} USING fts5(${cols}, content='${table}', content_rowid='rowid', tokenize='trigram remove_diacritics 1');`,
    `INSERT INTO ${q(name)} (${q(name)}, rank) VALUES ('secure-delete', 1);`,
    `CREATE TRIGGER ${q(`${name}_insert`)} AFTER INSERT ON ${q(table)} BEGIN INSERT INTO ${q(name)} (rowid, ${cols}) VALUES (new.rowid, ${values('new')}); END;`,
    `CREATE TRIGGER ${q(`${name}_delete`)} AFTER DELETE ON ${q(table)} BEGIN INSERT INTO ${q(name)} (${q(name)}, rowid, ${cols}) VALUES ('delete', old.rowid, ${values('old')}); END;`,
    `CREATE TRIGGER ${q(`${name}_update`)} AFTER UPDATE OF ${cols} ON ${q(table)} BEGIN INSERT INTO ${q(name)} (${q(name)}, rowid, ${cols}) VALUES ('delete', old.rowid, ${values('old')}); INSERT INTO ${q(name)} (rowid, ${cols}) VALUES (new.rowid, ${values('new')}); END;`,
    `INSERT INTO ${q(name)} (${q(name)}) VALUES ('rebuild');`,
  ]
}

/** The marker a migration carries for each index it makes, so the checks can tell what is current. */
export function searchIndexMarker(table: string, columns: readonly string[] | null): string {
  return `-- search-index: ${table} ${columns ? columns.join(',') : '-'}`
}

/** The last marker for each table in a journal's SQL: its columns, or null where the index was dropped. */
export function searchIndexesInSql(sql: string): Map<string, string[] | null> {
  const found = new Map<string, string[] | null>()
  for (const m of sql.matchAll(/^-- search-index: (\S+) (\S+)$/gm)) found.set(m[1]!, m[2] === '-' ? null : m[2]!.split(','))
  return found
}

/**
 * Which searched field matched, for each row of a page (S5): the first hidden field holding every
 * word that no shown field holds, compared in the Worker with the same fold the index uses.
 */
export function matchedFields<Row extends Record<string, unknown>>(rows: readonly Row[], words: readonly string[], fields: readonly { key: keyof Row & string, hidden: boolean }[]): (string | null)[] {
  return rows.map((row) => {
    const text = (key: string) => typeof row[key] === 'string' ? foldText(row[key] as string) : ''
    const shown = fields.filter(f => !f.hidden)
    const unmatched = words.filter(w => !shown.some(f => text(f.key).includes(w)))
    if (!unmatched.length) return null
    return fields.find(f => f.hidden && unmatched.some(w => text(f.key).includes(w)))?.key ?? null
  })
}

export interface SearchIndexState {
  index: string
  table: string
  /** Rows the index holds and rows its table holds; they differ when the index needs a rebuild. */
  indexed: number
  rows: number
  secureDelete: boolean
}

/** The search indexes in this database, read from the database itself, with their state (S4, S8). */
export async function searchIndexStates(db: D1Database): Promise<SearchIndexState[]> {
  const found = await db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_search' ESCAPE '\\' AND sql LIKE 'CREATE VIRTUAL TABLE%fts5%'").all<{ name: string, sql: string }>()
  const out: SearchIndexState[] = []
  for (const { name, sql } of found.results) {
    const table = /content='([a-z0-9_]+)'/.exec(sql)?.[1]
    if (!table || name !== searchIndexName(table)) continue
    const [indexed, rows, secure] = await db.batch([
      db.prepare(`SELECT count(*) AS n FROM \`${name}_docsize\``),
      db.prepare(`SELECT count(*) AS n FROM \`${table}\``),
      db.prepare(`SELECT v FROM \`${name}_config\` WHERE k = 'secure-delete'`),
    ]) as [D1Result<{ n: number }>, D1Result<{ n: number }>, D1Result<{ v: number }>]
    out.push({ index: name, table, indexed: indexed.results[0]!.n, rows: rows.results[0]!.n, secureDelete: secure.results[0]?.v === 1 })
  }
  return out
}

/** The statement that refills an index from its table, used by core.search-rebuild. */
export function rebuildSearchIndexStatement(index: string): string {
  return `INSERT INTO \`${index}\` (\`${index}\`) VALUES ('rebuild')`
}
