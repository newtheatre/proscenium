import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, forgetSpentStep, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'
import { codeForStep, stepFor } from '#shared/utils/totp'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-116 through the real routes. The database-level race is proven directly against a scratch
// database in tests/integration/races-refund.test.ts; this confirms the wiring end to end (0022).

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

  // MANAGER is privileged (0037/A-112) and now carries money.refund (D-116 criterion 2), so the
  // full MFA dance is needed before requirePermission honours the grant, exactly as D-114's did.
  const managerPassword = generatePassword()
  manager = await registerMember(app, 'manager', managerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'BOX_OFFICE' }, officer.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'MANAGER' }, officer.cookie)

  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, manager.cookie)).json() as { secret: string }
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, manager.cookie)
  forgetSpentStep(app, manager.email)
  const { attemptId } = await (await request(app, 'POST', '/api/auth/sign-in', { email: manager.email, password: managerPassword })).json() as { attemptId: string }
  const managerAnswered = await request(app, 'POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  manager = { ...manager, cookie: (managerAnswered.headers.get('set-cookie') ?? '').split(';')[0]! }

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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const weekOffsetSeconds = 7 * 86_400

async function collectedBooking(price = 900): Promise<{ reservationId: string, ticketId: string, performanceId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + weekOffsetSeconds
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt }, officer.cookie)
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }, officer.cookie)
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Refund Tester', email: registrableAddress('guest') },
  }, '')
  const { reference } = await answered.json() as { reference: string }
  const reservationId = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', reference)!.id

  const collected = await send('POST', `/api/box-office/desk/reservations/${reservationId}/collect`, {
    expectedTotalPence: price,
    tender: 'CARD',
  })
  expect(collected.status).toBe(200)

  const ticketId = query<{ id: string }>('SELECT id FROM tickets WHERE reservation_id = ?', reservationId)!.id
  return { reservationId, ticketId, performanceId }
}

// A confirmed shift, not a standing grant (0009, 0044): the direct-insert pattern every e2e
// suite needing one uses (no offer/accept HTTP round trip needed for a fixture).
function confirmDutyManagerTonight(userId: string, performanceId: string): void {
  write(
    'INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(), performanceId, 'DUTY_MANAGER', 1, userId, 'CONFIRMED',
  )
}

describe.skipIf(skip !== null)('a refund is money handed back in person, one ticket at a time (criteria 1, 3)', () => {
  test('a matching figure refunds the ticket, posts a negative ledger line and frees the seat', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)

    const refunded = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, {
      expectedTotalPence: 900,
    }, manager.cookie)
    expect(refunded.status).toBe(200)

    const ticket = query<{ refundedAt: number | null }>('SELECT refunded_at AS refundedAt FROM tickets WHERE id = ?', ticketId)
    expect(ticket?.refundedAt).not.toBeNull()

    const line = query<{ kind: string, amountPence: number }>(
      'SELECT kind AS kind, amount_pence AS amountPence FROM ledger_lines WHERE ticket_id = ? AND kind = ?', ticketId, 'REFUND',
    )
    expect(line).toEqual({ kind: 'REFUND', amountPence: -900 })

    // Criterion 5: the customer's own booking view no longer lists it.
    const detail = await send('GET', `/api/box-office/desk/reservations/${reservationId}`)
    const body = await detail.json() as { tickets: { ticketId: string }[] }
    expect(body.tickets.some(one => one.ticketId === ticketId)).toBe(false)
  }, CASE_TIMEOUT_MS)

  test('a mismatch is refused quoting both figures, and nothing is written', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)

    const wrong = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, {
      expectedTotalPence: 500,
    }, manager.cookie)
    expect(wrong.status).toBe(409)
    const text = await wrong.text()
    expect(text).toContain('£5.00')
    expect(text).toContain('£9.00')

    const ticket = query<{ refundedAt: number | null }>('SELECT refunded_at AS refundedAt FROM tickets WHERE id = ?', ticketId)
    expect(ticket?.refundedAt).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('an already-refunded ticket is refused a second time', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)
    const first = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)
    expect(first.status).toBe(200)

    const second = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)
    expect(second.status).toBe(409)
  }, CASE_TIMEOUT_MS)

  test('an unpaid booking has nothing to refund from here', async () => {
    const { performanceId, ticketTypeId } = await (async () => {
      const title = named('An Unpaid Show')
      const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
      const showId = (await show.json() as { id: string }).id
      const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: Math.floor(Date.now() / 1000) + weekOffsetSeconds }, officer.cookie)
      const performanceId = (await performance.json() as { id: string }).id
      const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 }, officer.cookie)
      const ticketTypeId = (await type.json() as { id: string }).id
      expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)
      return { performanceId, ticketTypeId }
    })()

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Unpaid Tester', email: registrableAddress('guest') },
    }, '')
    const { reference } = await answered.json() as { reference: string }
    const reservationId = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', reference)!.id
    const ticketId = query<{ id: string }>('SELECT id FROM tickets WHERE reservation_id = ?', reservationId)!.id

    const refused = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)
    expect(refused.status).toBe(409)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('who may approve a refund (criterion 2)', () => {
  test('an ordinary box office officer, holding neither money.refund nor a duty-manager shift, is refused', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)

    const refused = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 })
    expect(refused.status).toBe(403)

    const ticket = query<{ refundedAt: number | null }>('SELECT refunded_at AS refundedAt FROM tickets WHERE id = ?', ticketId)
    expect(ticket?.refundedAt).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('tonight\'s confirmed duty manager approves without holding money.refund or any MFA', async () => {
    const database = new Database(app.databaseFile)
    let seeded: { performanceId: string, night: string }
    try {
      // Booking closes at curtain (no override set here), so curtain must sit ahead of whatever
      // time this suite happens to run, not the fixture's usual fixed 19:30.
      const night = currentShowNight()
      const hoursIntoNight = (Date.now() - showNightBounds(night).from.getTime()) / 3_600_000
      const curtainHoursAfterNightStart = Math.min(23.9, hoursIntoNight + 0.1)
      seeded = tonightsPerformance(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), night, curtainHoursAfterNightStart })
    }
    finally {
      database.close()
    }

    const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 }, officer.cookie)
    const ticketTypeId = (await type.json() as { id: string }).id

    const answered = await send('POST', '/api/reservations', {
      performanceId: seeded.performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Tonight Tester', email: registrableAddress('guest') },
    }, '')
    const { reference } = await answered.json() as { reference: string }
    const reservationId = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', reference)!.id

    const collected = await send('POST', `/api/box-office/desk/reservations/${reservationId}/collect`, { expectedTotalPence: 900, tender: 'CARD' })
    expect(collected.status).toBe(200)
    const ticketId = query<{ id: string }>('SELECT id FROM tickets WHERE reservation_id = ?', reservationId)!.id

    // The desk screen itself needs ticketing.write to reach at all; the confirmed shift is
    // what then carries the refund's own approval, not a second standing grant (D-116 criterion 2).
    const dutyManager = await registerMember(app, 'dutymanager', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: dutyManager.id, role: 'BOX_OFFICE' }, officer.cookie)
    confirmDutyManagerTonight(dutyManager.id, seeded.performanceId)

    const refunded = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, dutyManager.cookie)
    expect(refunded.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('a duty-manager shift on a different performance does not reach this one', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)

    const database = new Database(app.databaseFile)
    let elsewhere: { performanceId: string }
    try {
      elsewhere = tonightsPerformance(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) })
    }
    finally {
      database.close()
    }

    const dutyManager = await registerMember(app, 'dutymanager', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: dutyManager.id, role: 'BOX_OFFICE' }, officer.cookie)
    confirmDutyManagerTonight(dutyManager.id, elsewhere.performanceId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, dutyManager.cookie)
    expect(refused.status).toBe(403)
  }, CASE_TIMEOUT_MS)

  test('REFUND_PAID_REQUIRES_MANAGER off lets an ordinary officer refund directly', async () => {
    const set = await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', { value: false }, officer.cookie)
    expect(set.status).toBe(200)
    try {
      const { reservationId, ticketId } = await collectedBooking(900)
      const refunded = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 })
      expect(refunded.status).toBe(200)
    }
    finally {
      await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', { value: true }, officer.cookie)
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the double refund: concurrent requests for the same ticket (criterion 4, K-121)', () => {
  test('exactly one request succeeds and exactly one ledger line is written', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)

    const answers = await race(2, async () => {
      const answered = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)
      return { status: answered.status }
    })

    expectOneWinner(answers)

    const lines = query<{ total: number }>('SELECT count(*) AS total FROM ledger_lines WHERE ticket_id = ? AND kind = ?', ticketId, 'REFUND')
    expect(lines?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('cancelling a collected booking (criterion 6)', () => {
  test('refused while any ticket still holds unrefunded money, quoting the amount', async () => {
    const { reservationId } = await collectedBooking(900)

    const refused = await send('POST', `/api/box-office/desk/reservations/${reservationId}/cancel`, {}, manager.cookie)
    expect(refused.status).toBe(409)
    expect(await refused.text()).toContain('£9.00')

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', reservationId)
    expect(row?.status).toBe('COLLECTED')
  }, CASE_TIMEOUT_MS)

  test('once every ticket is refunded, the booking cancels', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)
    const refunded = await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)
    expect(refunded.status).toBe(200)

    const cancelled = await send('POST', `/api/box-office/desk/reservations/${reservationId}/cancel`, {}, manager.cookie)
    expect(cancelled.status).toBe(200)

    const row = query<{ status: string, cancelledBy: string | null }>(
      'SELECT status, cancelled_by AS cancelledBy FROM reservations WHERE id = ?', reservationId,
    )
    expect(row?.status).toBe('CANCELLED')
    expect(row?.cancelledBy).toBe('STAFF')
  }, CASE_TIMEOUT_MS)

  test('an ordinary box office officer cancels once nothing is owed: cancelling itself needs no refund authority', async () => {
    const { reservationId, ticketId } = await collectedBooking(900)
    await send('POST', `/api/box-office/desk/reservations/${reservationId}/tickets/${ticketId}/refund`, { expectedTotalPence: 900 }, manager.cookie)

    const cancelled = await send('POST', `/api/box-office/desk/reservations/${reservationId}/cancel`, {})
    expect(cancelled.status).toBe(200)
  }, CASE_TIMEOUT_MS)
})
