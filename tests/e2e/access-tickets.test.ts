import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-128 through the real routes: an entitled booker sees and books an access or companion
// ticket, the entitlement is counted and refused by name, and the door reads the agreed wording.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let accessOfficer: TestMember
let venueId: string

// The officer account carries no authenticator; narrowing PRIVILEGED_ROLES for one request is
// the same shortcut tests/e2e/access-profiles.test.ts uses to reach a route without an A-112 dance.
async function withoutSecondFactor<T>(fn: () => Promise<T>): Promise<T> {
  await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN'] })
  try {
    return await fn()
  }
  finally {
    await send('PUT', '/api/admin/config/PRIVILEGED_ROLES', { value: ['ADMIN', 'MANAGER', 'THEATRE_MANAGER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER'] })
  }
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)

  accessOfficer = await registerMember(app, 'access', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: accessOfficer.id, role: 'ACCESSIBILITY_OFFICER' }, admin.cookie)

  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { cookie: as } : {}) },
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
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

const BLANK_FLAGS = {
  standing: false, crowds: false, levelAccess: false, distance: false, urgentToilet: false,
  essentialCompanion: false, visualInformation: false, audibleInformation: false, other: false,
}

async function verifiedPatron(companions: number, fohNote = 'Aisle seat, assistance dog'): Promise<TestMember> {
  const patron = await registerMember(app, 'patron', generatePassword())
  expect((await send('PUT', '/api/account/access-profile', {
    flags: { ...BLANK_FLAGS, levelAccess: true },
    companions,
    requesterNote: 'Uses a wheelchair',
    accessCardNumber: null,
    consent: true,
  }, patron.cookie)).status).toBe(200)

  const verified = await withoutSecondFactor(() =>
    send('POST', `/api/admin/access-profiles/${patron.id}/verify`, { fohNote }, accessOfficer.cookie))
  expect(verified.status).toBe(200)
  return patron
}

async function bookableShow(): Promise<{ showId: string, performanceId: string, ticketTypeId: string, accessTypeId: string, companionTypeId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id

  const access = await send('POST', '/api/admin/ticket-types', { name: named('Access'), price: 900, accessKind: 'ACCESS' })
  const accessTypeId = (await access.json() as { id: string }).id

  const companion = await send('POST', '/api/admin/ticket-types', { name: named('Companion'), price: 0, accessKind: 'COMPANION' })
  const companionTypeId = (await companion.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { showId, performanceId, ticketTypeId, accessTypeId, companionTypeId }
}

function ledgerLineForType(ticketTypeId: string): { amountPence: number, performanceId: string | null } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(`
      SELECT l.amount_pence AS amountPence, l.performance_id AS performanceId FROM ledger_lines l
      JOIN tickets t ON t.id = l.ticket_id
      WHERE t.ticket_type_id = ?
    `).get(ticketTypeId) as { amountPence: number, performanceId: string | null } | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('who sees an access or companion type (criterion 1)', () => {
  test('an ordinary signed-out visitor never sees either type', async () => {
    const { performanceId } = await bookableShow()
    const answered = await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')
    const { ticketTypes, accessEntitlement } = await answered.json() as { ticketTypes: { accessKind: string | null }[], accessEntitlement: unknown }
    expect(ticketTypes.every(type => type.accessKind === null)).toBe(true)
    expect(accessEntitlement).toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a signed-in member with no access profile never sees either type', async () => {
    const { performanceId } = await bookableShow()
    const member = await registerMember(app, 'member', generatePassword())
    const answered = await send('GET', `/api/performances/${performanceId}/booking`, undefined, member.cookie)
    const { ticketTypes } = await answered.json() as { ticketTypes: { accessKind: string | null }[] }
    expect(ticketTypes.every(type => type.accessKind === null)).toBe(true)
  }, CASE_TIMEOUT_MS)

  test('a verified, consented, unexpired patron sees both types and their entitlement', async () => {
    const { performanceId } = await bookableShow()
    const patron = await verifiedPatron(2)
    const answered = await send('GET', `/api/performances/${performanceId}/booking`, undefined, patron.cookie)
    const { ticketTypes, accessEntitlement } = await answered.json() as {
      ticketTypes: { accessKind: string | null }[]
      accessEntitlement: { access: number, companion: number } | null
    }
    expect(ticketTypes.some(type => type.accessKind === 'ACCESS')).toBe(true)
    expect(ticketTypes.some(type => type.accessKind === 'COMPANION')).toBe(true)
    expect(accessEntitlement).toEqual({ access: 1, companion: 2 })
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('companion tickets price at zero (criterion 3)', () => {
  test('a companion ticket type cannot be created above nought', async () => {
    const created = await send('POST', '/api/admin/ticket-types', { name: named('Companion'), price: 100, accessKind: 'COMPANION' })
    expect(created.status).toBe(400)
  }, CASE_TIMEOUT_MS)

  test('booking a companion ticket snapshots zero, and collecting it posts a zero-value ledger line', async () => {
    const { performanceId, accessTypeId, companionTypeId } = await bookableShow()
    const patron = await verifiedPatron(1)

    const booked = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 1 }, { ticketTypeId: companionTypeId, quantity: 1 }],
    }, patron.cookie)
    expect(booked.status).toBe(200)
    const { reference, tickets, totalPence } = await booked.json() as
      { reference: string, tickets: { ticketTypeId: string, pricePaid: number }[], totalPence: number }
    expect(tickets).toHaveLength(2)
    expect(tickets.find(t => t.ticketTypeId === companionTypeId)?.pricePaid).toBe(0)

    const boxOffice = await registerMember(app, 'collector', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)
    const searched = await send('GET', `/api/box-office/desk/search?performanceId=${performanceId}&q=${reference}`, undefined, boxOffice.cookie)
    const { items: results } = await searched.json() as { items: { id: string }[] }
    const collected = await send('POST', `/api/box-office/desk/reservations/${results[0]!.id}/collect`, { expectedTotalPence: totalPence, tender: 'CARD' }, boxOffice.cookie)
    expect(collected.status).toBe(200)

    const line = ledgerLineForType(companionTypeId)
    expect(line?.amountPence).toBe(0)
    // Everything record-like keys to a performance (CLAUDE.md): a companion admission is exactly
    // that, and must be findable by the night it covers, not just by its ticket.
    expect(line?.performanceId).toBe(performanceId)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('entitlement is per performance, counted across every source (criteria 2, 5)', () => {
  test('a second access ticket in the same order is refused, naming the limit', async () => {
    const { performanceId, accessTypeId } = await bookableShow()
    const patron = await verifiedPatron(0)

    const refused = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 2 }],
    }, patron.cookie)
    expect(refused.status).toBe(409)
    expect(await refused.text()).toContain('1 access ticket')
  }, CASE_TIMEOUT_MS)

  test('a companion beyond the verified count is refused, naming the limit and nothing about the profile', async () => {
    const { performanceId, companionTypeId } = await bookableShow()
    const patron = await verifiedPatron(1)

    const refused = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: companionTypeId, quantity: 2 }],
    }, patron.cookie)
    expect(refused.status).toBe(409)
    const text = await refused.text()
    expect(text).toContain('1 companion ticket')
    expect(text).not.toContain('wheelchair')
  }, CASE_TIMEOUT_MS)

  test('what is already held against this performance counts, including a desk-made booking', async () => {
    const { performanceId, accessTypeId } = await bookableShow()
    const patron = await verifiedPatron(0)

    expect((await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 1 }],
    }, patron.cookie)).status).toBe(200)

    const database = new Database(app.databaseFile)
    try {
      database.query(`
        INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, 'COLLECTED', 'DESK')
      `).run('desk-r-1', 'ZZ0099', performanceId, patron.id)
      database.query(`
        INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, 'BASE')
      `).run('desk-t-1', 'desk-r-1', performanceId, accessTypeId, 900)
    }
    finally {
      database.close()
    }

    const refused = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 1 }],
    }, patron.cookie)
    expect(refused.status).toBe(409)
  }, CASE_TIMEOUT_MS)

  test('a guest is never entitled: an access type id is unknown to them', async () => {
    const { performanceId, accessTypeId } = await bookableShow()
    const refused = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 1 }],
      guest: { name: 'A Guest', email: `guest-${crypto.randomUUID()}@example.invalid` },
    }, '')
    expect(refused.status).toBe(400)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the door sees the agreed wording, and nothing more (criterion 4)', () => {
  test('a booking with an access ticket carries the wording on the desk\'s own scan screen', async () => {
    const { performanceId, accessTypeId } = await bookableShow()
    const patron = await verifiedPatron(0, 'Aisle seat, own wheelchair')

    const booked = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId: accessTypeId, quantity: 1 }],
    }, patron.cookie)
    const { reference } = await booked.json() as { reference: string }

    const boxOffice = await registerMember(app, 'deskofficer', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)

    const searched = await send('GET', `/api/box-office/desk/search?performanceId=${performanceId}&q=${reference}`, undefined, boxOffice.cookie)
    const { items: results } = await searched.json() as { items: { id: string }[] }
    const detail = await send('GET', `/api/box-office/desk/reservations/${results[0]!.id}`, undefined, boxOffice.cookie)
    const { doorWording } = await detail.json() as { doorWording: string | null }
    expect(doorWording).toBe('Aisle seat, own wheelchair')
  }, CASE_TIMEOUT_MS)

  test('an ordinary booking, even by a verified patron, carries no wording at all', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const patron = await verifiedPatron(1, 'Should never surface here')

    const booked = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
    }, patron.cookie)
    const { reference } = await booked.json() as { reference: string }

    const boxOffice = await registerMember(app, 'deskofficer2', generatePassword())
    await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, admin.cookie)

    const searched = await send('GET', `/api/box-office/desk/search?performanceId=${performanceId}&q=${reference}`, undefined, boxOffice.cookie)
    const { items: results } = await searched.json() as { items: { id: string }[] }
    const detail = await send('GET', `/api/box-office/desk/reservations/${results[0]!.id}`, undefined, boxOffice.cookie)
    const { doorWording } = await detail.json() as { doorWording: string | null }
    expect(doorWording).toBeNull()
  }, CASE_TIMEOUT_MS)
})
