import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { join } from 'node:path'
import { MAX_BOUND_PARAMETERS, sqliteTarget } from '../../scripts/seed/statements'
import type { BoundStatement, SeedTarget } from '../../scripts/seed/statements'

const MIGRATIONS_DIR = 'server/db/migrations/sqlite'

// The currency and the sinks live with the seed builders, so a fixture and a development database
// are written by the same code (K-120). Re-exported here because tests reach for them by habit.
export { MAX_BOUND_PARAMETERS, sqliteTarget }
export type { BoundStatement, SeedTarget }

export interface TestDatabase {
  db: BunSQLiteDatabase<Record<string, never>>
  raw: Database
  batch: (statements: BoundStatement[]) => void
  // A natural-key lookup, which is what makes a seed builder re-runnable against this database.
  get: <T>(statement: string, ...parameters: unknown[]) => T | undefined
  close: () => void
}

interface JournalEntry { tag: string }

async function migrationTags(): Promise<string[]> {
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

// An in-memory database per suite: nothing to clean up, and no test can reach another's rows.
export async function createTestDatabase(): Promise<TestDatabase> {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  await applyMigrations(raw)
  const db = drizzle(raw)
  // D1 has no interactive transaction: atomicity is batch only (0001, 0003). The sink mirrors
  // its all-or-nothing semantics so a test exercises the shape production runs.
  const target = sqliteTarget(raw)

  return {
    db,
    raw,
    batch: target.batch,
    get: target.get,
    close() {
      raw.close()
    },
  }
}

// A read helper for assertions, kept out of the drizzle query builder so a test can assert on
// exactly the SQL it means.
export function rows<T>(database: TestDatabase, statement: string, ...parameters: unknown[]): T[] {
  return database.raw.prepare(statement).all(...parameters as never[]) as T[]
}

export { sql }

// Drizzle builds a statement and its parameters; the harness runs the pair the way D1 does. The
// cast is because `dialect` is internal, and one contained cast beats one in every test.
export function boundStatement(database: TestDatabase, statement: SQL): BoundStatement {
  const dialect = (database.db as unknown as {
    dialect: { sqlToQuery: (query: SQL) => { sql: string, params: unknown[] } }
  }).dialect
  const query = dialect.sqlToQuery(statement)
  return [query.sql, ...query.params]
}
