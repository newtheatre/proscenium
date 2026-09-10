import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { sqliteTarget } from '#tests/helpers/database'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import { londonDayOf } from '#shared/utils/ledger'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// I-107 against the real routes: a period close refuses a new collection dated inside it, and
// reopening lets the same collection through again (criteria 1, 2, 4).

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

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

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

// A booked and reserved, but not yet collected, ticket: collection is the write this file locks
// out, so the reservation itself has to exist first, outside whatever period gets closed.
async function reservedTicket(price = 900): Promise<{ reservationId: string }> {
  const title = named('Period Close Test')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + 7 * 86_400
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt }, officer.cookie)
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }, officer.cookie)
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Period Close Tester', email: registrableAddress('guest') },
  }, '')
  const { reference } = await answered.json() as { reference: string }
  const reservationId = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', reference)!.id
  return { reservationId }
}

const collect = (reservationId: string, price = 900): Promise<Response> =>
  send('POST', `/api/box-office/desk/reservations/${reservationId}/collect`, { expectedTotalPence: price, tender: 'CARD' })

describe.skipIf(skip !== null)('a closed period refuses a new collection (criteria 1, 2)', () => {
  test('collecting today, with today closed, is refused; reopening lets it through', async () => {
    const today = londonDayOf(new Date())
    const { reservationId } = await reservedTicket(900)

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay: today, toDay: today })
    expect(closed.status).toBe(200)
    const { id: lockId } = await closed.json() as { id: string }

    const refused = await collect(reservationId)
    expect(refused.status).toBe(409)
    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', reservationId)
    expect(row?.status).toBe('PENDING')

    const reopened = await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: today, confirmToDay: today })
    expect(reopened.status).toBe(200)

    const collected = await collect(reservationId)
    expect(collected.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('a wrong typed confirmation refuses the reopen and leaves the period closed', async () => {
    const today = londonDayOf(new Date())
    const { reservationId } = await reservedTicket(900)

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay: today, toDay: today, label: named('Term') })
    const { id: lockId } = await closed.json() as { id: string }

    const wrong = await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: '2000-01-01', confirmToDay: today })
    expect(wrong.status).toBe(409)

    const stillRefused = await collect(reservationId)
    expect(stillRefused.status).toBe(409)
  }, CASE_TIMEOUT_MS)

  test('a collection outside the closed range is unaffected', async () => {
    const { reservationId } = await reservedTicket(900)

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay: '2000-01-01', toDay: '2000-01-31' })
    expect(closed.status).toBe(200)

    const collected = await collect(reservationId)
    expect(collected.status).toBe(200)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('closing and reopening are treasurer and administrator work respectively', () => {
  test('an officer holding neither finance.write nor ADMIN cannot close a period', async () => {
    const member = await registerMember(app, 'notreasurer', generatePassword())
    const refused = await send('POST', '/api/admin/finance/periods', { fromDay: '2000-01-01', toDay: '2000-01-31' }, member.cookie)
    expect(refused.status).toBe(403)
  }, CASE_TIMEOUT_MS)

  test('the treasurer role closes but cannot reopen', async () => {
    const treasurer = await registerMember(app, 'treasurer', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: treasurer.id, role: 'TREASURER' }, officer.cookie)

    const closed = await send('POST', '/api/admin/finance/periods', { fromDay: '2000-02-01', toDay: '2000-02-28' }, treasurer.cookie)
    expect(closed.status).toBe(200)
    const { id: lockId } = await closed.json() as { id: string }

    const reopened = await send('POST', `/api/admin/finance/periods/${lockId}/reopen`, { confirmFromDay: '2000-02-01', confirmToDay: '2000-02-28' }, treasurer.cookie)
    expect(reopened.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
