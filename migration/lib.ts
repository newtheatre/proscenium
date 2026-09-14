import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const ROOT = join(import.meta.dir, '..')
export const DUMPS = join(ROOT, 'migration/dumps')
export const OUT = join(ROOT, 'migration/out')
export const SOURCES = ['auth', 'rooms', 'training', 'proscenium'] as const
export type Source = (typeof SOURCES)[number]

export async function latestStamp(): Promise<string> {
  const f = Bun.file(join(DUMPS, 'LATEST'))
  if (!await f.exists()) throw new Error('No dumps found. Run migration/export.sh first.')
  return (await f.text()).trim()
}

// One statement at a time inside one transaction: exec() over the whole 44 MB proscenium dump
// is quadratic and never finishes; this takes under a second (13 September 2026).
export function execDump(db: Database, text: string): number {
  let ran = 0
  let buffer = ''
  db.exec('BEGIN')
  for (const line of text.split(/\r?\n/)) {
    buffer += (buffer ? '\n' : '') + line
    const statement = buffer.trim()
    if (!statement.endsWith(';')) continue
    // A line ending inside a quoted value (a synopsis with a semicolon) is not a boundary.
    if ((statement.match(/'/g) ?? []).length % 2 === 1) continue
    if (statement.startsWith('PRAGMA')) {
      buffer = ''
      continue
    }
    try {
      db.run(statement)
      ran++
      buffer = ''
    }
    catch (error) {
      // A value holding ";\n" ends a line without ending the statement; keep reading.
      if (!String((error as Error).message).includes('incomplete input')) throw error
    }
  }
  db.exec('COMMIT')
  if (buffer.trim()) throw new Error(`dump ended mid-statement: ${buffer.slice(0, 80)}`)
  return ran
}

// Loads one dump into a database (in memory unless a path is given). Dumps are trusted output
// of wrangler d1 export.
export async function loadDump(source: Source, stamp?: string, path = ':memory:'): Promise<Database> {
  const file = join(DUMPS, stamp ?? await latestStamp(), `${source}.sql`)
  const db = new Database(path)
  db.exec('PRAGMA foreign_keys = OFF;')
  execDump(db, await Bun.file(file).text())
  return db
}

export function tables(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name NOT LIKE \'sqlite_%\' AND name NOT LIKE \'\\_%\' ESCAPE \'\\\' ORDER BY name',
    )
    .all()
    .map(r => r.name)
}

export function count(db: Database, table: string, where = ''): number {
  const sql = `SELECT count(*) n FROM "${table}"${where ? ` WHERE ${where}` : ''}`
  return (db.query<{ n: number }, []>(sql).get() as { n: number }).n
}

export function sum(db: Database, table: string, col: string, where = ''): number {
  const sql = `SELECT COALESCE(sum("${col}"),0) n FROM "${table}"${where ? ` WHERE ${where}` : ''}`
  return (db.query<{ n: number }, []>(sql).get() as { n: number }).n
}

// The one directory call Bun has no API for: Bun.write creates a file's parents, but
// bun:sqlite opening a database in this directory does not.
export function ensureOut(): void {
  mkdirSync(OUT, { recursive: true })
}

// Every id map is a tab-separated file under out/, read back before anything is minted so the
// same old row keeps the same unified id across runs (0015, K-112 criterion 4).
export async function readMap(name: string, dir = OUT): Promise<Map<string, string>> {
  const path = join(dir, name)
  const map = new Map<string, string>()
  if (!await Bun.file(path).exists()) return map
  for (const line of (await Bun.file(path).text()).split('\n')) {
    const [from, to] = line.split('\t')
    if (from && to) map.set(from, to)
  }
  return map
}

export async function writeMap(name: string, map: Map<string, string>, dir = OUT): Promise<void> {
  await Bun.write(join(dir, name), `${[...map.entries()].map(([from, to]) => `${from}\t${to}`).join('\n')}\n`)
}

export async function writeLines(name: string, lines: readonly string[], dir = OUT): Promise<void> {
  await Bun.write(join(dir, name), lines.join('\n') + (lines.length ? '\n' : ''))
}

export async function writeJson(name: string, value: unknown, dir = OUT): Promise<void> {
  await Bun.write(join(dir, name), `${JSON.stringify(value, null, 2)}\n`)
}

// The old estate's timestamps come three ways: epoch seconds, epoch milliseconds, and SQLite or
// ISO text (UTC, with or without a zone suffix). All become epoch seconds; NaN is never returned.
export function parseStamp(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return value >= 10_000_000_000 ? Math.floor(value / 1000) : value
  const text = value.trim().replace(' ', 'T')
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`
  const parsed = new Date(zoned).getTime()
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

// Every migration writer keyed to a person guards its conflict branch with this, insert left
// open where a table's own erasure only scrubs rather than deletes (0011, 0059).
export const NOT_ANONYMISED = (table: string, column = 'user_id'): string =>
  `NOT EXISTS (SELECT 1 FROM users WHERE id = ${table}.${column} AND anonymised_at IS NOT NULL)`

const ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let id = ''
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i]! & 61]
  return id
}

// A minted unified id for an old row, read from the map or made fresh and recorded.
export function idFor(map: Map<string, string>, key: string): string {
  const existing = map.get(key)
  if (existing) return existing
  const fresh = nanoid(32).toLowerCase().replaceAll(/[^a-z0-9]/g, '0')
  map.set(key, fresh)
  return fresh
}
