// The one currency every seed builder speaks, and the sinks that run it. A builder returns
// statements and reads nothing it has not been handed, so the CLI and a test suite share them.

import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import type { Database } from 'bun:sqlite'
import type { SQL } from 'drizzle-orm'

// D1 caps a statement at 100 bound parameters and the repository chunks at 90 (0003).
export const MAX_BOUND_PARAMETERS = 90

// A statement and its bound parameters, the shape D1's prepare/bind takes.
export type BoundStatement = [statement: string, ...parameters: unknown[]]

// A seed target both writes and reads: a natural-key lookup is what lets a re-run adopt a row an
// earlier seed created under a random id rather than inserting a duplicate beside it.
export interface SeedTarget {
  batch: (statements: BoundStatement[]) => void
  get: <T>(statement: string, ...parameters: unknown[]) => T | undefined
}

export function sqliteTarget(database: Database): SeedTarget {
  return {
    // One transaction per call, mirroring D1's all-or-nothing batch (0001, 0003).
    batch(statements) {
      for (const [, ...parameters] of statements) {
        if (parameters.length > MAX_BOUND_PARAMETERS) {
          throw new Error(`statement binds ${parameters.length} parameters, over the ${MAX_BOUND_PARAMETERS} chunk limit: D1 refuses this in production (0003)`)
        }
      }
      // Thrown as it came: a suite asserting on a constraint refusal matches the driver's own
      // message, so wrapping it here would break every one of them (0047).
      database.transaction(() => {
        for (const [statement, ...parameters] of statements) {
          database.prepare(statement).run(...parameters as never[])
        }
      })()
    },
    get: <T>(statement: string, ...parameters: unknown[]): T | undefined =>
      (database.prepare(statement).get(...parameters as never[]) as T | null) ?? undefined,
  }
}

// Readable and stable, so a re-run is a no-op and a row in a development database says where it
// came from. Sixty-four characters is the column bound every id here fits inside.
export function seedId(...parts: (string | number)[]): string {
  return `seed-${parts.join('-')}`.toLowerCase().replaceAll(/[^a-z0-9-]+/g, '-').slice(0, 64)
}

export interface Row { [column: string]: unknown }

function columnsOf(row: Row): { names: string[], values: unknown[] } {
  const names = Object.keys(row)
  return { names, values: names.map(name => row[name]) }
}

/** An insert that a re-run skips, which is every table keyed by an id this seed chose. */
export function insert(table: string, row: Row, conflict = 'DO NOTHING'): BoundStatement {
  const { names, values } = columnsOf(row)
  const placeholders = names.map(() => '?').join(', ')
  const columns = names.map(name => `"${name}"`).join(', ')
  return [`INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT ${conflict}`, ...values]
}

/** An insert with no conflict clause, for a table whose triggers refuse an UPDATE anyway. */
export function insertOnly(table: string, row: Row): BoundStatement {
  const { names, values } = columnsOf(row)
  const placeholders = names.map(() => '?').join(', ')
  const columns = names.map(name => `"${name}"`).join(', ')
  return [`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, ...values]
}

export interface Ensured { id: string, made: boolean }

// The row this seed means, whether an earlier run or an earlier seed created it. Matching on the
// natural key rather than the id is what stops a second copy appearing beside the first.
export function ensure(
  target: SeedTarget,
  table: string,
  key: { column: string, value: unknown },
  row: Row,
): Ensured {
  const held = target.get<{ id: string }>(`SELECT id FROM ${table} WHERE "${key.column}" = ? LIMIT 1`, key.value)
  if (held) return { id: held.id, made: false }
  target.batch([insert(table, row)])
  return { id: String(row.id), made: true }
}

// True when a row already answers that predicate. An append-only register cannot be updated, so a
// re-run must ask before it writes rather than conflict its way out (0010).
export function holds(target: SeedTarget, table: string, where: Row): boolean {
  const names = Object.keys(where)
  const clause = names.map(name => `"${name}" = ?`).join(' AND ')
  return Boolean(target.get(`SELECT 1 FROM ${table} WHERE ${clause} LIMIT 1`, ...names.map(name => where[name])))
}

// What `postEntry` hands back, turned into the currency the sinks run. The ledger has one writer
// and this is how a script reaches it rather than reaching its tables (0004).
export function boundFrom(statements: unknown[]): BoundStatement[] {
  return statements.map((statement) => {
    const query = (statement as { toSQL: () => { sql: string, params: unknown[] } }).toSQL()
    return [query.sql, ...query.params] as BoundStatement
  })
}

const dialect = new SQLiteSyncDialect()

// A drizzle SQL fragment carries its own parameters, which is what `erasureStatements` returns.
export function boundFromSQL(statements: SQL[]): BoundStatement[] {
  return statements.map((statement) => {
    const query = dialect.sqlToQuery(statement)
    return [query.sql, ...query.params] as BoundStatement
  })
}
