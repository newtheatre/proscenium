import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'server/db/migrations/sqlite'

// D1 caps a statement at 100 bound parameters and the repository chunks at 90 (0003). SQLite
// accepts far more, so without this a test passes and production fails.
export const MAX_BOUND_PARAMETERS = 90

// A statement and its bound parameters, the shape D1's prepare/bind takes.
export type BoundStatement = [statement: string, ...parameters: unknown[]]

export interface TestDatabase {
  db: BunSQLiteDatabase<Record<string, never>>
  raw: Database
  batch: (statements: BoundStatement[]) => void
  close: () => void
}

interface JournalEntry { tag: string }

async function migrationTags(): Promise<string[]> {
  const journal = Bun.file(join(MIGRATIONS_DIR, 'meta', '_journal.json'))
  if (!await journal.exists()) return []
  const parsed = await journal.json() as { entries?: JournalEntry[] }
  return (parsed.entries ?? []).map(entry => entry.tag)
}

// Applies the compiled migrations in journal order, which is the order production applies them.
export async function applyMigrations(raw: Database): Promise<string[]> {
  const applied: string[] = []
  for (const tag of await migrationTags()) {
    const file = Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`))
    if (!await file.exists()) throw new Error(`migration ${tag} is in the journal but has no .sql file`)
    // Drizzle separates statements with this marker; splitting on `;` breaks triggers.
    for (const statement of (await file.text()).split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) raw.exec(trimmed)
    }
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

  return {
    db,
    raw,
    // D1 has no interactive transaction: atomicity is batch only (0001, 0003). This mirrors
    // its all-or-nothing semantics so a test exercises the shape production runs.
    batch(statements) {
      for (const [, ...parameters] of statements) {
        if (parameters.length > MAX_BOUND_PARAMETERS) {
          throw new Error(`statement binds ${parameters.length} parameters, over the ${MAX_BOUND_PARAMETERS} chunk limit: D1 refuses this in production (0003)`)
        }
      }
      raw.transaction(() => {
        for (const [statement, ...parameters] of statements) {
          raw.prepare(statement).run(...parameters as never[])
        }
      })()
    },
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
