import { existsSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { applyMigrations } from '../../migration/schema'

// Emptied, then refilled with what a fresh migration seeds, so a suite starts as production does.
// The schema is untouched, since the server holds the file open (0029), and audit_log stays.
const KEPT = new Set(['_hub_migrations', 'audit_log'])

// The dev server is serving from this file while we wipe it, so a write can meet its lock.
// Waiting beats throwing at once.
const RESET_LOCK_WAIT_MS = 10_000
const RESET_ATTEMPTS = 5

type Row = Record<string, unknown>

function tablesOf(database: Database): string[] {
  return (database.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map(table => table.name)
    .filter(name => !KEPT.has(name))
}

// Read from the migrations themselves, once a process: a table a new migration seeds comes back
// with no list to keep.
let seeded: Promise<Map<string, Row[]>> | null = null

export function migratedSeeds(): Promise<Map<string, Row[]>> {
  seeded ??= (async () => {
    const fresh = new Database(':memory:')
    try {
      await applyMigrations(fresh)
      const rows = tablesOf(fresh).map(table => [table, fresh.query(`SELECT * FROM "${table}"`).all() as Row[]] as const)
      return new Map(rows.filter(([, found]) => found.length > 0))
    }
    finally {
      fresh.close()
    }
  })()
  return seeded
}

// WAL, so a long read on the server no longer blocks a suite's writes, nor theirs its reads
// (0109). The mode lives in the file, and nothing but the harness ever opens this one.
export function journalInWal(file: string): void {
  if (!existsSync(file)) return
  const database = new Database(file)
  try {
    database.run(`PRAGMA busy_timeout = ${RESET_LOCK_WAIT_MS}`)
    database.run('PRAGMA journal_mode = WAL')
  }
  finally {
    database.close()
  }
}

export async function resetDatabase(file: string): Promise<void> {
  journalInWal(file)
  const seeds = await migratedSeeds()
  const database = new Database(file)
  try {
    database.run(`PRAGMA busy_timeout = ${RESET_LOCK_WAIT_MS}`)
    const tables = tablesOf(database)

    // An append-only table refuses a delete, and its rows hold a foreign key onto users, so a
    // reset cannot get past either without lifting the guards (0010).
    const triggers = database.query(`
      SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL
    `).all() as { name: string, sql: string }[]

    // One transaction, so the lock is taken and released once, and so the guards are never off
    // outside it. Recreated from the schema rather than restated, so they cannot drift.
    const wipe = database.transaction(() => {
      for (const trigger of triggers) database.run(`DROP TRIGGER IF EXISTS ${trigger.name}`)
      for (const table of tables) database.run(`DELETE FROM "${table}"`)
      for (const table of tables) refill(database, table, seeds.get(table) ?? [])
      for (const trigger of triggers) database.run(trigger.sql)
    })

    // A rolled-back attempt leaves the guards up, so retrying is safe. One suite losing the race
    // aborts every suite after it, because none of them gets a reset either.
    for (let attempt = 1; ; attempt++) {
      try {
        wipe()
        break
      }
      catch (thrown) {
        const busy = String(thrown).includes('SQLITE_BUSY') || String(thrown).includes('database is locked')
        if (!busy || attempt === RESET_ATTEMPTS) throw thrown
        Bun.sleepSync(200 * attempt)
      }
    }
  }
  finally {
    database.close()
  }
}

function refill(database: Database, table: string, rows: Row[]): void {
  if (rows.length === 0) return
  const columns = Object.keys(rows[0]!)
  const insert = database.prepare(`INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
  // Finalised here: close() defers while a prepared statement lives, and the file stays held.
  try {
    for (const row of rows) insert.run(...columns.map(column => row[column]) as never[])
  }
  finally {
    insert.finalize()
  }
}
