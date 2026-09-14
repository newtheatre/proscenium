// The application's own migrations, applied to a scratch SQLite in journal order: the same
// schema production runs, built the same way, so a rehearsal target is never hand-maintained.
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { ROOT } from './lib'

export const MIGRATIONS_DIR = join(ROOT, 'server/db/migrations/sqlite')

interface JournalEntry { tag: string }

export async function migrationTags(): Promise<string[]> {
  const journal = Bun.file(join(MIGRATIONS_DIR, 'meta', '_journal.json'))
  if (!await journal.exists()) return []
  const parsed = await journal.json() as { entries?: JournalEntry[] }
  return (parsed.entries ?? []).map(entry => entry.tag)
}

// One migration's own compiled SQL, applied in isolation: what a test seeding the schema as it
// stood right before a specific rebuild uses to apply that rebuild alone (0052).
export async function applyMigration(raw: Database, tag: string): Promise<void> {
  const file = Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`))
  if (!await file.exists()) throw new Error(`migration ${tag} is in the journal but has no .sql file`)
  // Drizzle separates statements with this marker; splitting on `;` breaks triggers.
  for (const statement of (await file.text()).split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) raw.exec(trimmed)
  }
}

// Applies the compiled migrations in journal order, which is the order production applies them.
// Stopping before a tag leaves the schema as it stood right when that migration is next (0052).
export async function applyMigrations(raw: Database, stopBefore?: string): Promise<string[]> {
  const applied: string[] = []
  for (const tag of await migrationTags()) {
    if (tag === stopBefore) break
    await applyMigration(raw, tag)
    applied.push(tag)
  }
  return applied
}

// The ledger NuxtHub keeps, in the spelling `nuxt db migrate` writes (the tag, no `.sql`), so a
// target built here answers /api/health exactly as production does.
export function recordMigrations(raw: Database, tags: readonly string[]): void {
  raw.exec(`CREATE TABLE IF NOT EXISTS _hub_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`)
  const insert = raw.prepare('INSERT OR IGNORE INTO _hub_migrations (name) VALUES (?)')
  for (const tag of tags) insert.run(tag)
}

// A fresh target carrying the whole application schema and its migration ledger.
export async function createTarget(path: string): Promise<Database> {
  const raw = new Database(path)
  raw.exec('PRAGMA foreign_keys = ON;')
  const applied = await applyMigrations(raw)
  recordMigrations(raw, applied)
  return raw
}
