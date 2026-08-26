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

// Loads one dump into an in-memory database. Dumps are trusted output of wrangler d1 export.
export async function loadDump(source: Source, stamp?: string): Promise<Database> {
  const path = join(DUMPS, stamp ?? await latestStamp(), `${source}.sql`)
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = OFF;')
  db.exec(await Bun.file(path).text())
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

const ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict'
export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  let id = ''
  for (let i = 0; i < size; i++) id += ALPHABET[bytes[i]! & 61]
  return id
}
