// The migration runner. One journal per owner, upstream's applied before the theatre's; each
// migration and its ledger row commit as one batch, so a failed migration leaves no trace; a
// changed checksum stops the runner. F-28 adds the maintenance page and the Apply button; until
// then pending migrations are applied automatically only where PROSCENIUM_AUTO_MIGRATE is "1"
// (dev, preview and tests).
import { useContext } from './context'
import { nowMs } from './clock'
import { log } from './log'

export interface Migration { owner: 'upstream' | 'site' | 'fixtures', name: string, sql: string, checksum: string }

let bundle: Migration[] = []
let release = '0.0.0'
const checked = new WeakSet<object>()

export function installMigrations(migrations: Migration[], version = release): void {
  bundle = migrations
  release = version
}

/** One value for the whole migration bundle: a practice store made from another ends (rule S7). */
export async function bundleHash(): Promise<string> {
  return checksum(bundle.map(m => `${m.owner}/${m.name}:${m.checksum}`).join('\n'))
}

export function splitStatements(sql: string): string[] {
  return sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
}

export async function checksum(sql: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sql))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function ledger(db: D1Database): Promise<Map<string, string>> {
  const exists = await db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'core_migrations'").first()
  if (!exists) return new Map()
  const rows = await db.prepare('SELECT owner, name, checksum FROM core_migrations').all<{ owner: string, name: string, checksum: string }>()
  return new Map(rows.results.map(r => [`${r.owner}/${r.name}`, r.checksum]))
}

export async function pendingMigrations(db = useContext().env.DB): Promise<Migration[]> {
  const applied = await ledger(db)
  for (const m of bundle) {
    const recorded = applied.get(`${m.owner}/${m.name}`)
    if (recorded && recorded !== m.checksum) throw new Error(`Migration ${m.owner}/${m.name} has changed since it was applied. A released migration is never edited.`)
  }
  return bundle.filter(m => !applied.has(`${m.owner}/${m.name}`))
}

/** Applies every pending migration in order: upstream's, then the theatre's. */
export async function applyMigrations(db = useContext().env.DB): Promise<string[]> {
  const done: string[] = []
  const order = { upstream: 0, fixtures: 1, site: 2 }
  const pending = (await pendingMigrations(db)).sort((a, b) => order[a.owner] - order[b.owner] || a.name.localeCompare(b.name))
  for (const m of pending) {
    const started = nowMs()
    const statements = splitStatements(m.sql).map(s => db.prepare(s))
    statements.push(db.prepare('INSERT INTO core_migrations (owner, name, checksum, applied_at, duration_ms, release) VALUES (?, ?, ?, ?, ?, ?)').bind(m.owner, m.name, m.checksum, started, 0, release))
    try {
      await db.batch(statements)
    }
    catch (error) {
      throw new Error(`Migration ${m.owner}/${m.name} failed and was not applied: ${(error as Error).message}`, { cause: error })
    }
    done.push(`${m.owner}/${m.name}`)
    log.info('core.migrations.applied', { migration: `${m.owner}/${m.name}` })
  }
  return done
}

/** How long after a failed migration before the runner tries again. */
const RETRY_AFTER_MS = 60_000 // not-policy: a retry interval

export interface MigrationFailure { at: number, message: string }
const failures = new WeakMap<object, MigrationFailure>()

/** The last migration failure in this isolate, if the runner has not since succeeded. */
export function migrationFailure(db = useContext().env.DB): MigrationFailure | null {
  return failures.get(db as object) ?? null
}

/**
 * Where auto-migration is on, applies pending migrations once per database per isolate. A migration
 * that fails leaves the database as it was (each is one atomic batch), so the site keeps serving:
 * pages that do not need the new schema work, the failure is logged and shown on the health check,
 * and the runner tries again at most once a minute rather than on every request.
 */
export async function ensureMigrated(): Promise<void> {
  const { env } = useContext()
  if (env.PROSCENIUM_AUTO_MIGRATE !== '1' || checked.has(env.DB as object)) return
  const failed = failures.get(env.DB as object)
  if (failed && nowMs() - failed.at < RETRY_AFTER_MS) return
  try {
    await applyMigrations(env.DB)
    failures.delete(env.DB as object)
    checked.add(env.DB as object)
  }
  catch (error) {
    failures.set(env.DB as object, { at: nowMs(), message: (error as Error).message })
    log.error('core.migrations.failed', { error: (error as Error).message })
  }
}
