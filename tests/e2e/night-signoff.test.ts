import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-124 through the real routes. The pure statement and query builders are pinned against the
// real migrations in `tests/integration/night-signoff.test.ts`; this is the guard and the wiring.

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

function read<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

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

function closeChecklist(venueId: string, night: string, closedBy: string, suffix: string): void {
  write('INSERT INTO checklist_closes (id, venue_id, night, closed_by) VALUES (?, ?, ?, ?)',
    `close-${suffix}`, venueId, night, closedBy)
}

describe.skipIf(skip !== null)('the checklist gate (criterion 1)', () => {
  test('sign-off refuses before the checklist closes, and succeeds once it has', async () => {
    const dm = await registerMember(app, 'signoff-gate-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-gate' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)

    const blocked = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'All fine' }, dm.cookie)
    expect(blocked.status).toBe(409)

    closeChecklist(venueId, night, dm.id, 'gate')
    const signed = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'All fine' }, dm.cookie)
    expect(signed.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('sign-off itself (criteria 1, 2, 3)', () => {
  test('freezes a report exactly once for the performance, and a second attempt refuses', async () => {
    const dm = await registerMember(app, 'signoff-once-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-once' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'once')

    const first = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Quiet night' }, dm.cookie)
    expect(first.status).toBe(200)
    const body = await first.json() as { report: { signedByName: string, signedVia: string, closingNote: string } }
    expect(body.report.signedVia).toBe('SHIFT')
    expect(body.report.closingNote).toBe('Quiet night')

    const second = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Trying again' }, dm.cookie)
    expect(second.status).toBe(409)

    const rows = read<{ id: string }>('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)
    expect(rows).toHaveLength(1)
  })

  test('two concurrent sign-offs for the same performance produce exactly one row', async () => {
    const dm = await registerMember(app, 'signoff-race-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-race' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'race')

    const [first, second] = await Promise.all([
      send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Racer one' }, dm.cookie),
      send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Racer two' }, dm.cookie),
    ])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])

    const rows = read<{ id: string }>('SELECT id FROM night_reports WHERE performance_id = ?', performanceId)
    expect(rows).toHaveLength(1)
  })

  test('an officer closing instead of the duty manager is flagged as such', async () => {
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-officer' }))
    closeChecklist(venueId, night, admin.id, 'officer')

    const signed = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Covered by an officer' })
    expect(signed.status).toBe(200)
    const body = await signed.json() as { report: { signedVia: string } }
    expect(body.report.signedVia).toBe('OFFICER')
  })

  test('a door shift holder cannot sign off, and a signed-out caller is refused', async () => {
    const door = await registerMember(app, 'signoff-door', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-guard' }))
    shift(performanceId, 'DOOR', door.id)
    closeChecklist(venueId, night, door.id, 'guard')

    expect((await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Nope' }, door.cookie)).status).toBe(403)
    expect([401, 403]).toContain((await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Nope' }, '')).status)
  })

  test('records a delivery outcome for the standing recipients and the closer (criterion 4)', async () => {
    const dm = await registerMember(app, 'signoff-deliver-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-deliver' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'deliver')

    const signed = await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Send it' }, dm.cookie)
    expect(signed.status).toBe(200)

    const deliveries = read<{ recipient: string, status: string }>(
      `SELECT d.recipient AS recipient, d.status AS status FROM night_report_deliveries d
       JOIN night_reports r ON r.id = d.report_id WHERE r.performance_id = ?`, performanceId,
    )
    expect(deliveries.some(row => row.recipient === dm.email && row.status === 'SENT')).toBe(true)
  })
})

describe.skipIf(skip !== null)('the report freezes (E-123 criterion 4, E-124 criterion 5)', () => {
  test('a signed report stops recomputing: a later incident does not change it', async () => {
    const dm = await registerMember(app, 'signoff-frozen-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'signoff-frozen' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'frozen')

    const before = await send('GET', `/api/tonight/report?performanceId=${performanceId}`, undefined, dm.cookie)
    const beforeBody = await before.json() as { incidents: unknown[], signedOff: unknown }
    expect(beforeBody.signedOff).toBeNull()

    expect((await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Frozen now' }, dm.cookie)).status).toBe(200)

    write(`INSERT INTO incidents (id, performance_id, reported_by, category, severity, body) VALUES (?, ?, ?, 'OTHER', 'NOTE', 'After the freeze')`,
      'frozen-incident', performanceId, dm.id)

    const after = await send('GET', `/api/tonight/report?performanceId=${performanceId}`, undefined, dm.cookie)
    const afterBody = await after.json() as { incidents: { id: string }[], signedOff: { closingNote: string } | null, addenda: unknown[] }
    expect(afterBody.signedOff?.closingNote).toBe('Frozen now')
    expect(afterBody.incidents.some(row => row.id === 'frozen-incident')).toBe(false)
    expect(afterBody.addenda).toEqual([])
  })
})

describe.skipIf(skip !== null)('addenda (criterion 5)', () => {
  test('refuses a correction to a performance nobody has signed off yet', async () => {
    const { performanceId } = withBatch(runner => tonightsPerformance(runner, { suffix: 'addendum-unsigned' }))
    const refused = await send('POST', '/api/tonight/report/addenda', { performanceId, note: 'Too soon' })
    expect(refused.status).toBe(404)
  })

  test('adds a correction without editing the frozen report, and it appears on a fresh read', async () => {
    const dm = await registerMember(app, 'addendum-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'addendum-ok' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'addendum')
    await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Original note' }, dm.cookie)

    const added = await send('POST', '/api/tonight/report/addenda', { performanceId, note: 'The bar float was miscounted' })
    expect(added.status).toBe(200)

    const after = await send('GET', `/api/tonight/report?performanceId=${performanceId}`, undefined, dm.cookie)
    const body = await after.json() as { signedOff: { closingNote: string }, addenda: { note: string, addedByName: string }[] }
    expect(body.signedOff.closingNote).toBe('Original note')
    expect(body.addenda.some(row => row.note === 'The bar float was miscounted')).toBe(true)

    const deliveries = read<{ recipient: string }>(
      `SELECT d.recipient AS recipient FROM night_report_deliveries d
       JOIN night_report_addenda a ON a.id = d.addendum_id WHERE a.note = ?`, 'The bar float was miscounted',
    )
    expect(deliveries.length).toBeGreaterThan(0)
  })

  test('a member with no standing authority cannot add a correction', async () => {
    const stranger = await registerMember(app, 'addendum-stranger', generatePassword())
    const dm = await registerMember(app, 'addendum-guard-dm', generatePassword())
    const { performanceId, venueId, night } = withBatch(runner => tonightsPerformance(runner, { suffix: 'addendum-guard' }))
    shift(performanceId, 'DUTY_MANAGER', dm.id)
    closeChecklist(venueId, night, dm.id, 'addendum-guard')
    await send('POST', '/api/tonight/report/sign-off', { performanceId, closingNote: 'Note' }, dm.cookie)

    const refused = await send('POST', '/api/tonight/report/addenda', { performanceId, note: 'Not my call' }, stranger.cookie)
    expect(refused.status).toBe(403)
  })
})
