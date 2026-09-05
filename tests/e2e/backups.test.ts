import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// K-108 and J-107, against the real routes: recording a drill, the dashboard's overdue flag, and
// who may reach either.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

interface Status { lastDrillAt: string | null, lastDrillOutcome: string | null, intervalDays: number | null, overdue: boolean }
interface Listing { items: { id: string, ranAt: string, outcome: string }[], total: number }

function trail<T>(action: string, target: string): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT actor_id AS actorId, detail FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { actorId: string, detail: string } | null
    return row ? { actorId: row.actorId, detail: JSON.parse(row.detail) } as T : undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('recording a restore drill (K-108, J-107)', () => {
  test('with no drill ever recorded, the dashboard reads overdue', async () => {
    const status = await (await send('GET', '/api/admin/backups')).json() as Status
    expect(status.lastDrillAt).toBeNull()
    expect(status.overdue).toBe(true)
    expect(typeof status.intervalDays).toBe('number')
  })

  test('a recorded drill clears the flag and writes one audit entry', async () => {
    const ranAt = new Date().toISOString().slice(0, 10)
    const answered = await send('POST', '/api/admin/backups/drills', {
      ranAt, outcome: 'PASS', timeToRestoreMinutes: 24, rowCountsMatch: true, moneyTotalsMatch: true,
    })
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const status = await (await send('GET', '/api/admin/backups')).json() as Status
    expect(status.lastDrillAt).toBe(ranAt)
    expect(status.lastDrillOutcome).toBe('PASS')
    expect(status.overdue).toBe(false)

    const listing = await (await send('GET', '/api/admin/backups/drills')).json() as Listing
    expect(listing.items.some(item => item.id === id && item.outcome === 'PASS')).toBe(true)

    const entry = trail<{ actorId: string, detail: { outcome: string } }>('backup.drill-recorded', id)
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail.outcome).toBe('PASS')
  })

  // A failure is the finding, not a reason to omit it: it records and it does not clear the flag.
  test('a failed drill still records, and does not count as proof the backup restores', async () => {
    const answered = await send('POST', '/api/admin/backups/drills', {
      ranAt: new Date().toISOString().slice(0, 10),
      outcome: 'FAIL',
      timeToRestoreMinutes: 90,
      rowCountsMatch: true,
      moneyTotalsMatch: false,
      notes: 'Z-reading total was short by one bar session',
    })
    expect(answered.status).toBe(200)

    const status = await (await send('GET', '/api/admin/backups')).json() as Status
    expect(status.lastDrillOutcome).toBe('FAIL')
  })

  test('a shape the estate does not use is refused before it reaches the database', async () => {
    const answered = await send('POST', '/api/admin/backups/drills', {
      ranAt: '2026-09-10', outcome: 'PARTIAL', timeToRestoreMinutes: 10, rowCountsMatch: true, moneyTotalsMatch: true,
    })
    expect(answered.status).toBe(400)
  })
})

describe.skipIf(skip !== null)('who may reach the drill record', () => {
  test('an ordinary member reads nothing and writes nothing', async () => {
    expect((await send('GET', '/api/admin/backups', undefined, member.cookie)).status).toBe(403)
    expect((await send('GET', '/api/admin/backups/drills', undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/backups/drills', {
      ranAt: '2026-09-10', outcome: 'PASS', timeToRestoreMinutes: 5, rowCountsMatch: true, moneyTotalsMatch: true,
    }, member.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/backups', undefined, '')).status)
  })
})
