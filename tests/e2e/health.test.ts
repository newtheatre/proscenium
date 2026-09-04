import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// J-106 and K-107. Criterion 1 (200 when healthy, no session needed) is pinned by
// tests/e2e/smoke.test.ts; this covers criteria 2 and 4 against the live route.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

interface AppliedMigration { id: number, name: string, appliedAt: string }

function lastApplied(): AppliedMigration {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(
      'SELECT id, name, applied_at AS appliedAt FROM _hub_migrations ORDER BY id DESC LIMIT 1',
    ).get() as AppliedMigration
  }
  finally {
    database.close()
  }
}

function removeMigration(id: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('DELETE FROM _hub_migrations WHERE id = ?').run(id)
  }
  finally {
    database.close()
  }
}

// Restored by id, so the ledger reads exactly as it did before the test touched it: the shared
// dev server's next suite trusts this table without a reset of its own (0022).
function restoreMigration(row: AppliedMigration): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO _hub_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(row.id, row.name, row.appliedAt)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the health endpoint (J-106, K-107)', () => {
  test('a schema behind its code answers 503, naming the pending file (criterion 2)', async () => {
    const row = lastApplied()
    removeMigration(row.id)
    try {
      const response = await fetch(`${app.baseURL}/api/health`)
      const body = await response.json() as { ok: boolean, pendingMigrations: string[] }
      expect(response.status).toBe(503)
      expect(body.ok).toBe(false)
      expect(body.pendingMigrations).toContain(row.name)
    }
    finally {
      restoreMigration(row)
    }

    const healed = await fetch(`${app.baseURL}/api/health`)
    expect(healed.status).toBe(200)
  })

  test('a healthy response names nothing beyond its declared fields (criterion 4)', async () => {
    const response = await fetch(`${app.baseURL}/api/health`)
    const body = await response.json() as { ok: boolean, sessionKey: string }

    expect(Object.keys(body).sort()).toEqual(['bankHolidays', 'ok', 'sessionKey'])
    // A flag, never the secret itself: this is what stands between the session password and
    // the public internet, since the route is deliberately unauthenticated.
    expect(['ok', 'missing']).toContain(body.sessionKey)
  })
})
