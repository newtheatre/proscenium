import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-106 and D-107 through the real routes, the real task and the real screen. The predicate and
// the claim shape are pinned in tests/integration/holds.test.ts.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

async function runReleaseTask(): Promise<void> {
  expect((await fetch(`${app.baseURL}/_nitro/tasks/holds:release`, { method: 'POST' })).status).toBe(200)
}

function query<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(sql).get(...parameters as never[]) as T | undefined
  }
  finally {
    database.close()
  }
}

// A performance in the future, so the customer window (D-112) never refuses the booking, with
// its own hold-release override set so the test controls exactly when the hold expires.
async function setUpBookableShow(
  holdReleaseMinutesBefore: number,
  startsAtOffsetMinutes: number,
): Promise<{ performanceId: string, ticketTypeId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + startsAtOffsetMinutes * 60
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt })
  const performanceId = (await performance.json() as { id: string }).id

  expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
    venueId, startsAt, intervalCount: 0, holdReleaseMinutesBefore,
  })).status).toBe(200)

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, ticketTypeId }
}

async function bookedHold(
  holdReleaseMinutesBefore: number,
  startsAtOffsetMinutes = 7 * 24 * 60,
): Promise<{ reservationId: string, holdExpiresAt: number }> {
  const { performanceId, ticketTypeId } = await setUpBookableShow(holdReleaseMinutesBefore, startsAtOffsetMinutes)

  const email = registrableAddress('guest')
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Hold Tester', email },
  }, '')
  expect(answered.status).toBe(200)
  const reference = (await answered.json() as { reference: string }).reference

  const row = query<{ id: string, holdExpiresAt: number }>(
    'SELECT id, hold_expires_at AS holdExpiresAt FROM reservations WHERE reference = ?', reference,
  )!
  return { reservationId: row.id, holdExpiresAt: row.holdExpiresAt }
}

// Direct SQL, not the API: this simulates the passage of time between a valid booking and its
// own release point, the only way to reach that state now the write path refuses it outright.
function backdateHold(reservationId: string, at: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.prepare('UPDATE reservations SET hold_expires_at = ? WHERE id = ?').run(at, reservationId)
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('an unpaid hold releases once past its own expiry (D-106)', () => {
  const STARTS_AT_OFFSET_MINUTES = 60
  const HOLD_RELEASE_MINUTES_BEFORE = 5

  test('a hold past its release point is expired on the next run', async () => {
    const { reservationId } = await bookedHold(HOLD_RELEASE_MINUTES_BEFORE, STARTS_AT_OFFSET_MINUTES)
    backdateHold(reservationId, Math.floor(Date.now() / 1000) - 1)

    await runReleaseTask()

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', reservationId)
    expect(row?.status).toBe('EXPIRED')

    const audited = query<{ action: string }>(
      'SELECT action FROM audit_log WHERE action = ? AND target = ? AND actor_id IS NULL',
      'reservation.expired', `reservation:${reservationId}`,
    )
    expect(audited?.action).toBe('reservation.expired')
  }, CASE_TIMEOUT_MS)

  test('a second run finds nothing left to release', async () => {
    const { reservationId } = await bookedHold(HOLD_RELEASE_MINUTES_BEFORE, STARTS_AT_OFFSET_MINUTES)
    backdateHold(reservationId, Math.floor(Date.now() / 1000) - 1)
    await runReleaseTask()
    await runReleaseTask()

    const trail = query<{ total: number }>(
      'SELECT count(*) AS total FROM audit_log WHERE action = ? AND target = ?',
      'reservation.expired', `reservation:${reservationId}`,
    )
    expect(trail?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a booking born already past its release point is refused outright (D-106)', () => {
  // Thirty minutes out, releasing an hour before curtain: the release point is already past
  // the moment the reservation would be written, the committee decision this write path enforces.
  test('the reservation write path refuses rather than creating a doomed hold', async () => {
    const { performanceId, ticketTypeId } = await setUpBookableShow(60, 30)

    const email = registrableAddress('guest')
    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Hold Tester', email },
    }, '')

    expect(answered.status).toBe(409)

    const row = query<{ total: number }>(
      'SELECT count(*) AS total FROM reservations WHERE performance_id = ?', performanceId,
    )
    expect(row?.total).toBe(0)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a reminder sends once, inside its own window (D-107)', () => {
  // A performance an hour out, releasing 15 minutes before curtain: the hold expires 45 minutes
  // from now, comfortably later than either test's reminder window.
  const STARTS_AT_OFFSET_MINUTES = 60
  const HOLD_RELEASE_MINUTES_BEFORE = 15

  test('a hold not yet inside the reminder window sends nothing until it is', async () => {
    // A five-minute window against a hold 45 minutes out has not opened yet.
    expect((await send('PUT', '/api/admin/config/HOLD_REMINDER_MINUTES_BEFORE', { value: 5 })).status).toBe(200)
    const { reservationId } = await bookedHold(HOLD_RELEASE_MINUTES_BEFORE, STARTS_AT_OFFSET_MINUTES)
    await runReleaseTask()

    const sent = query<{ total: number }>(
      'SELECT count(*) AS total FROM notification_log WHERE type = ? AND record_id = ? AND status = ?',
      'reservation.hold-expiring', reservationId, 'SENT',
    )
    expect(sent?.total).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('a hold inside the reminder window is warned once, and a second run sends nothing more', async () => {
    // A fifty-minute window against a hold 45 minutes out already opened five minutes ago.
    expect((await send('PUT', '/api/admin/config/HOLD_REMINDER_MINUTES_BEFORE', { value: 50 })).status).toBe(200)
    const { reservationId } = await bookedHold(HOLD_RELEASE_MINUTES_BEFORE, STARTS_AT_OFFSET_MINUTES)

    await runReleaseTask()
    await runReleaseTask()

    const sent = query<{ total: number }>(
      'SELECT count(*) AS total FROM notification_log WHERE type = ? AND record_id = ? AND status = ?',
      'reservation.hold-expiring', reservationId, 'SENT',
    )
    expect(sent?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})
