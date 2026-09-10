import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, forgetSpentStep, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { codeForStep, stepFor } from '#shared/utils/totp'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-117: a comp is requested with a reason, approved by tonight's duty manager or a ticketing
// manager, never the requester, claimed atomically, and lapses on a timer.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let ticketingManager: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  boxOffice = await registerMember(app, 'comp-desk', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)

  // MANAGER is privileged (0037/A-112): requirePermission needs a confirmed second factor
  // before ticketing.write is honoured at all, not only ticketing.manage.
  const managerPassword = generatePassword()
  ticketingManager = await registerMember(app, 'comp-manager', managerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: ticketingManager.id, role: 'BOX_OFFICE' }, officer.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: ticketingManager.id, role: 'MANAGER' }, officer.cookie)

  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, ticketingManager.cookie)).json() as { secret: string }
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, ticketingManager.cookie)
  forgetSpentStep(app, ticketingManager.email)
  const { attemptId } = await (await request(app, 'POST', '/api/auth/sign-in', { email: ticketingManager.email, password: managerPassword })).json() as { attemptId: string }
  const managerAnswered = await request(app, 'POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  ticketingManager = { ...ticketingManager, cookie: (managerAnswered.headers.get('set-cookie') ?? '').split(';')[0]! }

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

let nextSlot = 500
function confirmDutyManagerShift(performanceId: string, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-DM-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, 'DUTY_MANAGER', nextSlot, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const weekOffsetSeconds = 7 * 86_400

async function bookableShow(price = 900): Promise<{ performanceId: string, ticketTypeId: string }> {
  const title = named('The Alchemist')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + weekOffsetSeconds
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt }, officer.cookie)
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }, officer.cookie)
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

  return { performanceId, ticketTypeId }
}

async function bookedReservation(performanceId: string, ticketTypeId: string): Promise<{ id: string }> {
  const email = registrableAddress('guest')
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Comp Tester', email },
  }, '')
  expect(answered.status).toBe(200)
  const { reference } = await answered.json() as { reference: string }
  const row = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', reference)!
  return { id: row.id }
}

async function requestedComp(reservationId: string, as = boxOffice.cookie): Promise<string> {
  const asked = await send('POST', '/api/box-office/desk/comp-requests', { reservationId, reason: 'A guest of the show' }, as)
  expect(asked.status).toBe(200)
  return (await asked.json() as { id: string }).id
}

const approve = (id: string, as = ticketingManager.cookie): Promise<Response> =>
  send('POST', `/api/box-office/desk/comp-requests/${id}/approve`, {}, as)
const decline = (id: string, reason: string, as = ticketingManager.cookie): Promise<Response> =>
  send('POST', `/api/box-office/desk/comp-requests/${id}/decline`, { reason }, as)

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

describe.skipIf(skip !== null)('asking for a comp (criterion 1)', () => {
  test('a reservation and a reason is accepted', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const id2 = await requestedComp(id)
    expect(id2).toBeTruthy()
  })

  test('a duty manager or a ticketing manager decides; ordinary desk access may not', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)

    const refused = await approve(requestId, boxOffice.cookie)
    expect(refused.status).toBe(403)

    const accepted = await approve(requestId, ticketingManager.cookie)
    expect(accepted.status).toBe(200)
  })

  test('a confirmed duty manager shift decides too, with no manager role at all', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)

    const dutyManager = await registerMember(app, 'comp-duty', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: dutyManager.id, role: 'BOX_OFFICE' }, officer.cookie)
    confirmDutyManagerShift(performanceId, dutyManager.id)

    expect((await approve(requestId, dutyManager.cookie)).status).toBe(200)
  })

  test('a requester can never approve their own request', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id, ticketingManager.cookie)

    const answered = await approve(requestId, ticketingManager.cookie)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('own request')
  })
})

describe.skipIf(skip !== null)('declining a comp (criterion 5)', () => {
  test('a decline is recorded and a subsequent approval is refused', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)

    expect((await decline(requestId, 'Past tonight\'s allowance')).status).toBe(200)
    const after = await approve(requestId)
    expect(after.status).toBe(409)
    expect(await message(after)).toContain('already been decided')
  })
})

describe.skipIf(skip !== null)('approval is claimed atomically (criterion 2)', () => {
  test('two approvals racing the same request settle to one decision', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)

    const dutyManager = await registerMember(app, 'comp-race-duty', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: dutyManager.id, role: 'BOX_OFFICE' }, officer.cookie)
    confirmDutyManagerShift(performanceId, dutyManager.id)

    const [first, second] = await Promise.all([approve(requestId, ticketingManager.cookie), approve(requestId, dutyManager.cookie)])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
  })

  test('two collections racing the same approval settle to one', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)
    expect((await approve(requestId)).status).toBe(200)

    const attempt = () => send('POST', `/api/box-office/desk/reservations/${id}/collect`, { expectedTotalPence: 0, tender: 'COMP', compRequestId: requestId })
    const [first, second] = await Promise.all([attempt(), attempt()])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
  })
})

describe.skipIf(skip !== null)('a comp counts against capacity exactly like a paid ticket (criterion 4)', () => {
  test('a comped ticket holds a seat, the same as any other', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { id } = await bookedReservation(performanceId, ticketTypeId)
    const requestId = await requestedComp(id)
    expect((await approve(requestId)).status).toBe(200)
    expect((await send('POST', `/api/box-office/desk/reservations/${id}/collect`, { expectedTotalPence: 0, tender: 'COMP', compRequestId: requestId })).status).toBe(200)

    const held = query<{ total: number }>(
      `SELECT count(*) AS total FROM tickets t JOIN reservations r ON r.id = t.reservation_id
       WHERE t.performance_id = ? AND t.refunded_at IS NULL AND r.status IN ('PENDING', 'COLLECTED', 'DOOR')`, performanceId,
    )
    expect(held?.total).toBe(1)
  }, CASE_TIMEOUT_MS)
})
