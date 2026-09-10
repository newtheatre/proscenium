import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-127 criterion 3 and D-108 criterion 5 through the real route: an ordinary ticket, not a
// pass, admits against the performance it belongs to and refuses loudly against any other.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let door: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  door = await registerMember(app, 'door-ticket-officer', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    ticketTypeFixture(sqliteTarget(database))
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = door.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
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

// A matinee and an evening at the same venue tonight, the exact shape E-127 exists for.
function houseWithTwoPerformances(): { matineeId: string, eveningId: string } {
  const suffix = crypto.randomUUID().slice(0, 8)
  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    const venueId = testVenue(target, { suffix }).id
    const matinee = tonightsPerformance(target, { suffix: `${suffix}-matinee`, venueId, curtainHoursAfterNightStart: 10 })
    const evening = tonightsPerformance(target, { suffix: `${suffix}-evening`, venueId, curtainHoursAfterNightStart: 15.5 })
    return { matineeId: matinee.performanceId, eveningId: evening.performanceId }
  }
  finally {
    database.close()
  }
}

let ticketCounter = 0

function ticket(performanceId: string, status: string, pricePaid = 900): { reference: string, id: string } {
  ticketCounter += 1
  const id = `r-door-ticket-${ticketCounter}`
  const reference = `TIX${String(ticketCounter).padStart(3, '0')}`
  write('INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
    id, reference, performanceId, status, 'WEB')
  write('INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)',
    `t-${id}`, id, performanceId, 'tt-standard', pricePaid, 'BASE')
  return { reference, id }
}

describe.skipIf(skip !== null)('scanning a paid ticket admits it (E-127 criterion 3)', () => {
  test('a paid ticket for the performance selected admits and reads DOOR afterwards', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const { reference, id } = ticket(matineeId, 'COLLECTED')

    const scanned = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId })
    expect(scanned.status).toBe(200)
    const { decision } = await scanned.json() as { decision: string }
    expect(decision).toBe('ADMIT')

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', id)
    expect(row?.status).toBe('DOOR')
  }, CASE_TIMEOUT_MS)

  test('scanning it again is refused as already admitted', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const { reference } = ticket(matineeId, 'COLLECTED')

    expect((await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId })).status).toBe(200)
    const again = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId })
    expect(again.status).toBe(409)
    expect((await again.text()).toLowerCase()).toContain('already checked in')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a ticket scanned against the wrong performance refuses loudly, naming the correct one (criterion 3)', () => {
  test('a matinee ticket scanned at the evening door is refused, naming the matinee', async () => {
    const { matineeId, eveningId } = houseWithTwoPerformances()
    const { reference } = ticket(matineeId, 'COLLECTED')

    const scanned = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: eveningId })
    expect(scanned.status).toBe(409)
    const message = await scanned.text()
    expect(message).toContain('A Test Show')
    expect(message.toLowerCase()).toContain('this ticket is for')

    // Untouched: a refused scan never admits the wrong house's seat.
    const row = query<{ status: string }>('SELECT status FROM reservations WHERE reference = ?', reference)
    expect(row?.status).toBe('COLLECTED')
  }, CASE_TIMEOUT_MS)

  test('wrong performance still wins over an unpaid ticket: one answer, not two', async () => {
    const { matineeId, eveningId } = houseWithTwoPerformances()
    const { reference } = ticket(matineeId, 'PENDING')

    const scanned = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: eveningId })
    expect(scanned.status).toBe(409)
    expect((await scanned.text()).toLowerCase()).toContain('this ticket is for')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('an unpaid or cancelled ticket refuses distinctly (D-108 criterion 5)', () => {
  test('unpaid names the amount due rather than admitting', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const { reference } = ticket(matineeId, 'PENDING')

    const scanned = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId })
    expect(scanned.status).toBe(409)
    expect(await scanned.text()).toContain('£9.00')
  }, CASE_TIMEOUT_MS)

  test('a cancelled ticket is refused, naming who cancelled it', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const { reference, id } = ticket(matineeId, 'PENDING')
    write('UPDATE reservations SET status = ?, cancelled_by = ? WHERE id = ?', 'CANCELLED', 'CUSTOMER', id)

    const scanned = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId })
    expect(scanned.status).toBe(409)
    expect(await scanned.text()).toContain('booker')
  }, CASE_TIMEOUT_MS)

  test('an unknown reference answers as though no such booking', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const answered = await send('POST', '/api/tonight/door/tickets/scan', { reference: 'ZZZZZZ', performanceId: matineeId })
    expect(answered.status).toBe(404)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the door role, and nobody else (0009)', () => {
  test('a signed-in member with no night authority is refused', async () => {
    const { matineeId } = houseWithTwoPerformances()
    const { reference } = ticket(matineeId, 'COLLECTED')
    const stranger = await registerMember(app, 'ticket-stranger', generatePassword())
    const answered = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId: matineeId }, stranger.cookie)
    expect(answered.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})
