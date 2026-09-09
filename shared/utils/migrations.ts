// The applied-migrations ledger carries both spellings: `nuxt-db migrate` records the bare
// tag, `wrangler d1 migrations apply` records it with `.sql`.
export function normaliseMigrationTag(name: string): string {
  return name.replace(/\.sql$/, '')
}

// Migrations the code expects that the database has not applied. A non-empty result means the
// deploy is ahead of its schema and the health check must go red (K-107).
export function pendingMigrations(expected: string[], applied: string[]): string[] {
  const seen = new Set(applied.map(normaliseMigrationTag))
  return expected.map(normaliseMigrationTag).filter(tag => !seen.has(tag))
}

export interface JournalEntry { idx: number, tag: string }

// Two branches each numbering a migration after the same parent means the second to merge
// collides. Git stops that merge on the journal; this catches a resolver keeping both entries.
export function journalProblems(entries: JournalEntry[], files: string[]): string[] {
  const problems: string[] = []

  const byIdx = new Map<number, string[]>()
  for (const entry of entries) byIdx.set(entry.idx, [...(byIdx.get(entry.idx) ?? []), entry.tag])

  // The ledger keys on the tag, so two entries at one idx both apply, in an order nobody chose.
  for (const [idx, tags] of byIdx) {
    if (tags.length > 1) problems.push(`idx ${idx} is claimed by ${tags.map(quoted).join(' and ')}.`)
  }

  // The filename prefix is what a person reads and what a conflict gets resolved against, so a
  // tag whose number disagrees with its place is the same collision wearing a different hat.
  for (const entry of entries) {
    const prefix = Number(entry.tag.slice(0, 4))
    if (!Number.isNaN(prefix) && prefix !== entry.idx) {
      problems.push(`${quoted(entry.tag)} is entry ${entry.idx}, so its number and its place disagree.`)
    }
  }

  const named = new Set(entries.map(entry => entry.tag))
  const present = new Set(files.map(normaliseMigrationTag))

  // A tag with no file stops the ledger there; a file in no entry never runs at all.
  for (const tag of named) {
    if (!present.has(tag)) problems.push(`${quoted(tag)} is in the journal and has no .sql file.`)
  }
  for (const file of present) {
    if (!named.has(file)) problems.push(`${quoted(`${file}.sql`)} is on disk and in no journal entry, so it never runs.`)
  }

  return problems
}

const quoted = (name: string): string => `\`${name}\``

export interface SnapshotForeignKey { onDelete?: string, tableTo: string }
export interface SnapshotTable {
  name: string
  foreignKeys?: Record<string, SnapshotForeignKey>
  columns?: Record<string, unknown>
}
export interface RebuildDependent { table: string, onDelete: string }

// Every table with an incoming foreign key, keyed by the table it points at, however the key is
// guarded: cascade, set null, restrict and the SQLite default no action all reach here.
export function dependentsByTable(tables: Record<string, SnapshotTable>): Map<string, RebuildDependent[]> {
  const dependentsOnto = new Map<string, RebuildDependent[]>()
  for (const table of Object.values(tables)) {
    for (const fk of Object.values(table.foreignKeys ?? {})) {
      if (!dependentsOnto.has(fk.tableTo)) dependentsOnto.set(fk.tableTo, [])
      dependentsOnto.get(fk.tableTo)!.push({ table: table.name, onDelete: fk.onDelete ?? 'no action' })
    }
  }
  return dependentsOnto
}

// What rebuilding `table` costs, one message per outcome its dependents force: cascade and set
// null lose data silently, restrict and no action abort the whole migration outright (0010).
export function rebuildDependentProblems(file: string, table: string, dependents: RebuildDependent[]): string[] {
  const problems: string[] = []
  const cascading = dependents.filter(d => d.onDelete === 'cascade').map(d => d.table)
  const nulling = dependents.filter(d => d.onDelete === 'set null').map(d => d.table)
  const blocking = dependents.filter(d => d.onDelete === 'restrict' || d.onDelete === 'no action').map(d => d.table)

  if (cascading.length) {
    problems.push(`${file}: rebuilds \`${table}\`, and dropping it cascades to `
      + `${cascading.map(quoted).join(', ')}. Those rows go silently.`)
  }
  if (nulling.length) {
    problems.push(`${file}: rebuilds \`${table}\`, and dropping it nulls the reference in `
      + `${nulling.map(quoted).join(', ')}. Those rows survive with the link silently severed.`)
  }
  if (blocking.length) {
    problems.push(`${file}: rebuilds \`${table}\`, and ${blocking.map(quoted).join(', ')} `
      + `reference it without cascading. The rebuild's own DROP TABLE runs with foreign keys still `
      + `enforced, so the whole migration aborts the moment a referencing row exists.`)
  }
  return problems
}

export interface RebuildCopy { targetTable: string, sourceTable: string, selected: string[] }

// The copying INSERT ... SELECT ... FROM every rebuild in `sql` runs, in order. The target
// table's own column list is not read: only what the SELECT names matters here.
const COPY_INSERT = /INSERT INTO `__new_(\w+)`\s*\([^)]*\)\s*SELECT\s+([\s\S]*?)\s+FROM\s+`?(\w+)`?/gi

function splitSelectList(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of list) {
    if (char === '(') depth++
    else if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export function copyingInserts(sql: string): RebuildCopy[] {
  return [...sql.matchAll(COPY_INSERT)].map(match => ({
    targetTable: match[1]!,
    sourceTable: match[3]!,
    selected: splitSelectList(match[2]!),
  }))
}

// Only a double-quoted token has SQLite's string-literal fallback (0052); other quoting styles
// fail loudly instead, which the existing scratch-database tests already catch.
const DOUBLE_QUOTED = /^"([^"]+)"$/

// A copying SELECT naming a column `sourceColumns` does not have: drizzle-kit emits this for a
// column the rebuild adds, expecting a real expression in its place (0052).
export function unresolvedCopyProblems(file: string, copy: RebuildCopy, sourceColumns: Set<string>): string[] {
  const problems: string[] = []
  for (const expression of copy.selected) {
    const match = DOUBLE_QUOTED.exec(expression)
    if (!match) continue
    const name = match[1]!
    if (sourceColumns.has(name)) continue
    problems.push(`${file}: the copying INSERT for \`${copy.targetTable}\` selects "${name}" from `
      + `\`${copy.sourceTable}\`, which has no such column. SQLite cannot resolve an unrecognised `
      + `double-quoted identifier as a column, so it falls back to reading it as the string literal `
      + `"${name}" instead, and every copied row silently gets that text rather than a real value.`)
  }
  return problems
}

// The schema just before `beforeNumber`: the highest-numbered snapshot below it, since a
// hand-authored migration between two drizzle-kit ones leaves no snapshot of its own.
export function snapshotBefore<T>(beforeNumber: number, snapshots: { number: number, data: T }[]): T | undefined {
  let best: { number: number, data: T } | undefined
  for (const snapshot of snapshots) {
    if (snapshot.number < beforeNumber && (!best || snapshot.number > best.number)) best = snapshot
  }
  return best?.data
}

export interface SnapshotLink { file: string, id: string, prevId: string }

// Drizzle-kit's sentinel for "no prior snapshot", carried by the first one only.
const ROOT_PREV_ID = '00000000-0000-0000-0000-000000000000'

// A snapshot missing from the journal is fine (a hand-authored migration); a snapshot that
// exists but does not link to another that does starves `snapshotBefore` of a baseline (0052).
export function snapshotChainProblems(links: SnapshotLink[]): string[] {
  const knownIds = new Set(links.map(link => link.id))
  const problems: string[] = []
  for (const link of links) {
    if (link.prevId === ROOT_PREV_ID || knownIds.has(link.prevId)) continue
    problems.push(`${link.file} expects a prior snapshot with id \`${link.prevId}\`, and no `
      + `snapshot on disk has it. Every rebuild between the missing snapshot and here is checked `
      + `with no real baseline, so a restrict-dependent or copying-column defect there passes silently.`)
  }
  return problems
}
