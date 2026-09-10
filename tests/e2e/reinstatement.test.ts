import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { showNightOf } from '#shared/utils/show-night'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-118 through the real routes: a genuinely expired hold (backdated and swept by the real
// task, D-106) or a genuinely customer-cancelled one (the real self-service route, D-110).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let manager: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  boxOffice = await registerMember(app, 'boxoffice', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)

  manager = await registerMember(app, 'manager', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'BOX_OFFICE' }, officer.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'MANAGER' }, officer.cookie)

  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = boxOffice.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Direct SQL, not the API: this simulates the passage of time between a valid booking and its
// own release point, the only way to reach EXPIRED short of actually waiting (holds.test.ts).
function backdateHold(reservationId: string, at: number): void {
  const database = new Database(app.databaseFile)
  try {
    database.prepare('UPDATE reservations SET hold_expires_at = ? WHERE id = ?').run(at, reservationId)
  }
  finally {
    database.close()
  }
}

async function runReleaseTask(): Promise<void> {
  expect((await fetch(`${app.baseURL}/_nitro/tasks/holds:release`, { method: 'POST' })).status).toBe(200)
}

async function qrCookie(qrToken: string): Promise<string> {
  const opened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
  return (opened.headers.get('set-cookie') ?? '').split(';')[0]!
}

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const weekOffsetSeconds = 7 * 86_400

async function bookableShow(capacityOverride?: number, price = 900): Promise<{ performanceId: string, ticketTypeId: string, startsAt: number, night: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + weekOffsetSeconds
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, {
    venueId, startsAt, ...(capacityOverride !== undefined ? { capacityOverride } : {}),
  }, officer.cookie)
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }, officer.cookie)
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

  return { performanceId, ticketTypeId, startsAt, night: showNightOf(new Date(startsAt * 1000)) }
}

async function bookedReservation(performanceId: string, ticketTypeId: string): Promise<{ reference: string, id: string, qrToken: string }> {
  const email = registrableAddress('guest')
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Reinstatement Tester', email },
  }, '')
  expect(answered.status).toBe(200)
  const body = await answered.json() as { reference: string, qrToken: string }
  const id = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', body.reference)!.id
  return { reference: body.reference, id, qrToken: body.qrToken }
}

async function expiredReservation(performanceId: string, ticketTypeId: string): Promise<{ reference: string, id: string }> {
  const booked = await bookedReservation(performanceId, ticketTypeId)
  backdateHold(booked.id, Math.floor(Date.now() / 1000) - 1)
  await runReleaseTask()
  expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booked.id)?.status).toBe('EXPIRED')
  return booked
}

describe.skipIf(skip !== null)('reinstating an expired or customer-cancelled hold (D-118 criteria 1, 2, 4)', () => {
  test('an expired hold is reinstated, keeps its reference and gains a fresh expiry', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await expiredReservation(performanceId, ticketTypeId)
    const before = query<{ holdExpiresAt: number }>('SELECT hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', booked.id)!

    const reinstated = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, {
      reason: 'Booker was held up on the tram, still coming',
    })
    expect(reinstated.status).toBe(200)
    expect((await reinstated.json() as { status: string }).status).toBe('PENDING')

    const row = query<{ status: string, reference: string, holdExpiresAt: number }>(
      'SELECT status, reference, hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', booked.id,
    )!
    expect(row.status).toBe('PENDING')
    expect(row.reference).toBe(booked.reference)
    expect(row.holdExpiresAt).toBeGreaterThan(before.holdExpiresAt)
  }, CASE_TIMEOUT_MS)

  test('a customer\'s own cancellation is reinstated', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await bookedReservation(performanceId, ticketTypeId)
    const cookie = await qrCookie(booked.qrToken)
    expect((await send('POST', '/api/qr/cancel', {}, cookie)).status).toBe(200)
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booked.id)?.status).toBe('CANCELLED')

    const reinstated = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason: 'Changed their mind again' })
    expect(reinstated.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('every reinstatement records who, why and when, without the reason in the audit detail', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await expiredReservation(performanceId, ticketTypeId)

    const reason = 'Rang ahead, running five minutes late'
    expect((await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason })).status).toBe(200)

    const history = query<{ actorId: string, reason: string, previousStatus: string }>(
      'SELECT actor_id AS actorId, reason, previous_status AS previousStatus FROM reservation_reinstatements WHERE reservation_id = ?', booked.id,
    )!
    expect(history.actorId).toBe(boxOffice.id)
    expect(history.reason).toBe(reason)
    expect(history.previousStatus).toBe('EXPIRED')

    const audited = query<{ detail: string | null }>(
      'SELECT detail FROM audit_log WHERE action = ? AND target = ? AND actor_id = ?',
      'reservation.reinstated', `reservation:${booked.id}`, boxOffice.id,
    )
    expect(audited).toBeDefined()
    expect(audited?.detail ?? null).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('an empty reason is refused before anything is written', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await expiredReservation(performanceId, ticketTypeId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason: '' })
    expect(refused.status).toBe(400)
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booked.id)?.status).toBe('EXPIRED')
  }, CASE_TIMEOUT_MS)

  test('a still-pending booking is not eligible: it was never lost', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await bookedReservation(performanceId, ticketTypeId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason: 'No reason to' })
    expect(refused.status).toBe(409)
  }, CASE_TIMEOUT_MS)

  test('no such booking is a 404, not a 409', async () => {
    const refused = await send('POST', '/api/box-office/desk/reservations/does-not-exist/reinstate', { reason: 'Anything' })
    expect(refused.status).toBe(404)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a refunded booking is never reinstated through this path (D-118 criterion 5)', () => {
  test('a staff cancellation, which only ever follows a refund, is refused', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await bookedReservation(performanceId, ticketTypeId)
    expect((await send('POST', `/api/box-office/desk/reservations/${booked.id}/collect`, {
      expectedTotalPence: 900, tender: 'CARD',
    })).status).toBe(200)

    const ticketId = query<{ id: string }>('SELECT id FROM tickets WHERE reservation_id = ?', booked.id)!.id
    expect((await send('POST', `/api/box-office/desk/reservations/${booked.id}/tickets/${ticketId}/refund`, {
      expectedTotalPence: 900,
    }, manager.cookie)).status).toBe(200)
    expect((await send('POST', `/api/box-office/desk/reservations/${booked.id}/cancel`)).status).toBe(200)
    expect(query<{ status: string, cancelledBy: string }>(
      'SELECT status, cancelled_by AS cancelledBy FROM reservations WHERE id = ?', booked.id,
    )).toMatchObject({ status: 'CANCELLED', cancelledBy: 'STAFF' })

    const refused = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason: 'Try it anyway' })
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('refunded')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the capacity re-check is live, not the screen\'s own read (D-118 criterion 1, 0003)', () => {
  test('reinstating over a resold seat is refused, quoting what is actually left', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(1)
    const lapsed = await expiredReservation(performanceId, ticketTypeId)
    await bookedReservation(performanceId, ticketTypeId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${lapsed.id}/reinstate`, { reason: 'Please, one more seat' })
    expect(refused.status).toBe(409)
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', lapsed.id)?.status).toBe('EXPIRED')
  }, CASE_TIMEOUT_MS)

  // The named race (0003): reinstating the lapsed hold and a fresh order both chase the one seat
  // it freed, fired together against the real routes so only one can ever win.
  test('reinstating races a fresh booking for the same freed seat: exactly one wins', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(1)
    const lapsed = await expiredReservation(performanceId, ticketTypeId)

    const [reinstated, freshOrder] = await Promise.all([
      send('POST', `/api/box-office/desk/reservations/${lapsed.id}/reinstate`, { reason: 'Racing the freed seat' }),
      send('POST', '/api/reservations', {
        performanceId,
        lines: [{ ticketTypeId, quantity: 1 }],
        guest: { name: 'Fresh Order', email: registrableAddress('guest') },
      }, ''),
    ])

    const statuses = [reinstated.status, freshOrder.status].sort()
    expect(statuses).toEqual([200, 409])

    const held = query<{ total: number }>(`
      SELECT count(*) AS total FROM tickets t JOIN reservations r ON r.id = t.reservation_id
      WHERE t.performance_id = ? AND t.refunded_at IS NULL AND r.status IN ('PENDING', 'COLLECTED', 'DOOR')
    `, performanceId)
    expect(held?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('who may reinstate (D-118 role: Box Office officer)', () => {
  test('an account holding no role at all is refused', async () => {
    const stranger = await registerMember(app, 'stranger', generatePassword())
    const { performanceId, ticketTypeId } = await bookableShow()
    const booked = await expiredReservation(performanceId, ticketTypeId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${booked.id}/reinstate`, { reason: 'Not my call' }, stranger.cookie)
    expect(refused.status).toBe(403)
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booked.id)?.status).toBe('EXPIRED')
  }, CASE_TIMEOUT_MS)
})
