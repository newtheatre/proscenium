import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-123 through the real route. Every section's own arithmetic is pinned in
// `tests/integration/night-report.test.ts`; this is the guard and the disambiguation (E-127).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

// A runner for `tonightsPerformance`/`testVenue`, which both take one rather than a raw handle.
function withBatch<T>(fn: (runner: { batch: (statements: [string, ...unknown[]][]) => void }) => T): T {
  const database = new Database(app.databaseFile)
  try {
    return fn({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    })
  }
  finally {
    database.close()
  }
}

function shift(performanceId: string, role: string, userId: string, status = 'CONFIRMED'): void {
  write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)',
    `${performanceId}-${role}`, performanceId, role, userId, status)
}

describe.skipIf(skip !== null)('the report guard (E-123)', () => {
  test('a confirmed duty manager reads it; a door shift holder is refused', async () => {
    const dm = await registerMember(app, 'report-dm', generatePassword())
    const door = await registerMember(app, 'report-door', generatePassword())
    const performanceId = withBatch(runner => tonightsPerformance(runner, { suffix: 'report-guard' }).performanceId)
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    shift(performanceId, 'DOOR', door.id)

    expect((await send('GET', '/api/tonight/report', undefined, dm.cookie)).status).toBe(200)
    expect((await send('GET', '/api/tonight/report', undefined, door.cookie)).status).toBe(403)
  })

  test('an unauthenticated caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/tonight/report', undefined, '')).status)
  })
})

describe.skipIf(skip !== null)('the report itself (E-123 criterion 1)', () => {
  test('carries incidents, follow-up state and milestones together', async () => {
    const dm = await registerMember(app, 'report-content-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'report-content' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    write(`INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, 'SAFETY', 'SERIOUS', 'Something happened')`,
      'report-incident', performanceId, dm.id)
    write('UPDATE incident_severity_config SET requires_follow_up = 1 WHERE severity = ?', 'SERIOUS')
    write('INSERT INTO backstage_nights (id, venue_id, night) VALUES (?, ?, ?)', 'report-bn', venueId, night)
    write('INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, 0)',
      'report-bd', 'report-bn', 'Stage left', 'b'.repeat(64))
    write(`INSERT INTO backstage_messages (id, night_id, device_id, milestone_type_id, body, composed_at)
           SELECT ?, ?, ?, id, label, unixepoch() FROM backstage_milestone_types WHERE label = 'Clearance'`,
    'report-milestone', 'report-bn', 'report-bd')

    const body = await (await send('GET', '/api/tonight/report', undefined, dm.cookie)).json() as {
      incidents: { id: string, followUpRequired: boolean, followUpClosed: boolean }[]
      milestones: { label: string }[]
    }
    expect(body.incidents.find(row => row.id === 'report-incident')).toMatchObject({ followUpRequired: true, followUpClosed: false })
    expect(body.milestones.some(row => row.label === 'Clearance')).toBe(true)
  })
})

describe.skipIf(skip !== null)('two performances, one venue, one day (E-127)', () => {
  test('a matinee and an evening compile as two independent reports', async () => {
    const dm = await registerMember(app, 'report-matinee-dm', generatePassword())
    const { matineeId, eveningId } = withBatch((runner) => {
      const venueId = testVenue(runner, { suffix: 'matinee-house' }).id
      return {
        matineeId: tonightsPerformance(runner, { suffix: 'matinee', venueId, curtainHoursAfterNightStart: 10 }).performanceId,
        eveningId: tonightsPerformance(runner, { suffix: 'evening', venueId, curtainHoursAfterNightStart: 15.5 }).performanceId,
      }
    })
    shift(matineeId, 'DUTY_MANAGER', dm.id)
    shift(eveningId, 'DUTY_MANAGER', dm.id)
    write(`INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, 'OTHER', 'NOTE', 'Matinee only')`,
      'matinee-incident', matineeId, dm.id)

    expect((await send('GET', '/api/tonight/report', undefined, dm.cookie)).status).toBe(400)

    const matineeReport = await (await send('GET', `/api/tonight/report?performanceId=${matineeId}`, undefined, dm.cookie)).json() as
      { performanceId: string, incidents: { id: string }[] }
    const eveningReport = await (await send('GET', `/api/tonight/report?performanceId=${eveningId}`, undefined, dm.cookie)).json() as
      { performanceId: string, incidents: { id: string }[] }

    expect(matineeReport.performanceId).toBe(matineeId)
    expect(matineeReport.incidents.some(row => row.id === 'matinee-incident')).toBe(true)
    expect(eveningReport.performanceId).toBe(eveningId)
    expect(eveningReport.incidents.some(row => row.id === 'matinee-incident')).toBe(false)
  })
})
