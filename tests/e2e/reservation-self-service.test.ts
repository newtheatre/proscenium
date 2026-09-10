import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-110's self-service edit and cancel through the real routes, against a QR cookie: the only
// credential a guest booker ever holds (D-108). D-111's exchange is a follow-up story.

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
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
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

function bookerFor(reference: string): string {
  return query<{ userId: string }>('SELECT user_id AS userId FROM reservations WHERE reference = ?', reference)!.userId
}

function cancellationsSent(userId: string): number {
  return query<{ total: number }>(
    'SELECT count(*) AS total FROM notification_log WHERE type = ? AND status = ? AND user_id = ?',
    'reservation.cancelled', 'SENT', userId,
  )?.total ?? 0
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

async function bookableShow(capacityOverride?: number): Promise<{ performanceId: string, standardId: string, concessionId: string }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, {
    venueId, startsAt: nextWeek(), ...(capacityOverride !== undefined ? { capacityOverride } : {}),
  })
  const performanceId = (await performance.json() as { id: string }).id

  const standard = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const standardId = (await standard.json() as { id: string }).id
  const concession = await send('POST', '/api/admin/ticket-types', { name: named('Concession'), price: 500 })
  const concessionId = (await concession.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, standardId, concessionId }
}

async function bookedReservation(
  performanceId: string,
  lines: { ticketTypeId: string, quantity: number }[],
): Promise<{ reference: string, qrToken: string }> {
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines,
    guest: { name: 'Self Service Tester', email: registrableAddress('guest') },
  }, '')
  expect(answered.status).toBe(200)
  return await answered.json() as { reference: string, qrToken: string }
}

async function qrCookie(qrToken: string): Promise<string> {
  const opened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
  return (opened.headers.get('set-cookie') ?? '').split(';')[0]!
}

describe.skipIf(skip !== null)('D-110: adding and removing tickets while unpaid (criterion 1)', () => {
  test('an addition raises the total, priced the same way a fresh booking is', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { reference, qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    const edited = await send('PUT', '/api/qr/tickets', { lines: [{ ticketTypeId: standardId, quantity: 3 }] }, cookie)
    expect(edited.status).toBe(200)
    expect((await edited.json() as { totalPence: number }).totalPence).toBe(2_700)

    const held = query<{ total: number }>(
      'SELECT count(*) AS total FROM tickets t JOIN reservations r ON r.id = t.reservation_id WHERE r.reference = ? AND t.refunded_at IS NULL',
      reference,
    )
    expect(held?.total).toBe(3)
  }, CASE_TIMEOUT_MS)

  test('a removal frees the seats immediately, for the next booking to take', async () => {
    const { performanceId, standardId } = await bookableShow(2)
    const { qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 2 }])
    const cookie = await qrCookie(qrToken)

    const edited = await send('PUT', '/api/qr/tickets', { lines: [{ ticketTypeId: standardId, quantity: 1 }] }, cookie)
    expect(edited.status).toBe(200)

    // The seat given back is available to a second, unrelated booking against the same house.
    const another = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: standardId, quantity: 1 }],
      guest: { name: 'Second Booker', email: registrableAddress('guest') },
    }, '')
    expect(another.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('adding one type and removing another in the same request applies both', async () => {
    const { performanceId, standardId, concessionId } = await bookableShow()
    const { qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 2 }])
    const cookie = await qrCookie(qrToken)

    const edited = await send('PUT', '/api/qr/tickets', {
      lines: [{ ticketTypeId: standardId, quantity: 1 }, { ticketTypeId: concessionId, quantity: 1 }],
    }, cookie)
    expect(edited.status).toBe(200)
    expect((await edited.json() as { totalPence: number }).totalPence).toBe(1_400)
  }, CASE_TIMEOUT_MS)

  test('a type named twice is refused before anything is written', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    const edited = await send('PUT', '/api/qr/tickets', {
      lines: [{ ticketTypeId: standardId, quantity: 1 }, { ticketTypeId: standardId, quantity: 1 }],
    }, cookie)
    expect(edited.status).toBe(400)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('D-110: net capacity is re-checked and the whole edit fails atomically (criterion 2)', () => {
  test('an increase past the house\'s capacity is refused, taking a same-request decrease down with it', async () => {
    const { performanceId, standardId, concessionId } = await bookableShow(3)
    const { qrToken } = await bookedReservation(performanceId, [
      { ticketTypeId: standardId, quantity: 1 }, { ticketTypeId: concessionId, quantity: 1 },
    ])
    const cookie = await qrCookie(qrToken)

    // Fill the rest of the house with somebody else's booking.
    const other = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: standardId, quantity: 1 }],
      guest: { name: 'Other Booker', email: registrableAddress('guest') },
    }, '')
    expect(other.status).toBe(200)

    // Wants standard 1 -> 3 (short by one) and concession 1 -> 0 in the same request: the
    // concession drop must not apply just because the standard increase was refused.
    const edited = await send('PUT', '/api/qr/tickets', { lines: [{ ticketTypeId: standardId, quantity: 3 }] }, cookie)
    expect(edited.status).toBe(409)

    const lines = query<{ total: number }>(
      `SELECT count(*) AS total FROM tickets t
       JOIN reservations r ON r.id = t.reservation_id
       WHERE r.performance_id = ? AND t.refunded_at IS NULL AND t.reservation_id IN (
         SELECT id FROM reservations WHERE performance_id = ? ORDER BY created_at LIMIT 1
       )`,
      performanceId, performanceId,
    )
    expect(lines?.total).toBe(2)
  }, CASE_TIMEOUT_MS)

  test('dropping to zero tickets is refused: cancel is the route for that', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    const edited = await send('PUT', '/api/qr/tickets', { lines: [] }, cookie)
    expect(edited.status).toBe(400)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('D-110: self-cancel while unpaid (criterion 3)', () => {
  test('cancelling records the customer as who cancelled, frees the seat and sends a confirmation', async () => {
    const { performanceId, standardId } = await bookableShow(1)
    const { reference, qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    const cancelled = await send('POST', '/api/qr/cancel', {}, cookie)
    expect(cancelled.status).toBe(200)

    const row = query<{ status: string, cancelledBy: string | null }>(
      'SELECT status, cancelled_by AS cancelledBy FROM reservations WHERE reference = ?', reference,
    )
    expect(row?.status).toBe('CANCELLED')
    expect(row?.cancelledBy).toBe('CUSTOMER')
    expect(cancellationsSent(bookerFor(reference))).toBe(1)

    // The freed seat is available again, since capacity was 1.
    const another = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: standardId, quantity: 1 }],
      guest: { name: 'Second Booker', email: registrableAddress('guest') },
    }, '')
    expect(another.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('cancelling once the performance has started is refused', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { reference, qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    write('UPDATE performances SET starts_at = ? WHERE id = ?', Math.floor(Date.now() / 1000) - 3_600, performanceId)

    const cancelled = await send('POST', '/api/qr/cancel', {}, cookie)
    expect(cancelled.status).toBe(409)

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE reference = ?', reference)
    expect(row?.status).toBe('PENDING')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('D-110: nothing self-service is left once money has moved (criterion 4)', () => {
  test('a collected booking refuses both an edit and a cancel', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { reference, qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    write('UPDATE reservations SET status = ? WHERE reference = ?', 'COLLECTED', reference)

    const edited = await send('PUT', '/api/qr/tickets', { lines: [{ ticketTypeId: standardId, quantity: 2 }] }, cookie)
    expect(edited.status).toBe(409)

    const cancelled = await send('POST', '/api/qr/cancel', {}, cookie)
    expect(cancelled.status).toBe(409)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('D-110: the QR is unchanged by an edit (criterion 5)', () => {
  test('the same token still opens the booking, now reading its new total', async () => {
    const { performanceId, standardId } = await bookableShow()
    const { qrToken } = await bookedReservation(performanceId, [{ ticketTypeId: standardId, quantity: 1 }])
    const cookie = await qrCookie(qrToken)

    await send('PUT', '/api/qr/tickets', { lines: [{ ticketTypeId: standardId, quantity: 2 }] }, cookie)

    const reopened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
    expect(reopened.status).toBe(302)
    expect(reopened.headers.get('location')).toBe('/qr')

    const current = await fetch(`${app.baseURL}/api/qr/current`, { headers: { cookie } })
    const body = await current.json() as { totalDue: string | null }
    expect(body.totalDue).toBe('£18.00')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a refused edit or cancel needs the QR cookie, not any signed-in session', () => {
  test('with no cookie at all, both routes refuse', async () => {
    const edited = await fetch(`${app.baseURL}/api/qr/tickets`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: [] }),
    })
    expect(edited.status).toBe(401)

    const cancelled = await fetch(`${app.baseURL}/api/qr/cancel`, { method: 'POST' })
    expect(cancelled.status).toBe(401)
  }, CASE_TIMEOUT_MS)
})
