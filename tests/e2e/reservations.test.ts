import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-104 through the real routes and the real screen. The capacity predicate itself is pinned in
// tests/integration/capacity.test.ts and its contended case in races-capacity.test.ts.

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
  venueId = venue(null)
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

// Seed changes closed after Wave 0, so the venue a performance needs comes from tests/helpers.
function venue(capacity: number | null): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8), capacity }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

async function bookableShow(over: Record<string, unknown> = {}): Promise<{ showId: string, performanceId: string, ticketTypeId: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, {
    venueId, startsAt: nextWeek(), ...over,
  })
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id

  // The cascade already takes a DRAFT performance on sale; a second, explicit on-sale call
  // would find it there already and be refused (D-121 criterion 2).
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { showId, performanceId, ticketTypeId }
}

function reservationFor(reference: string): { status: string, userId: string | null } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT status, user_id AS userId FROM reservations WHERE reference = ?')
      .get(reference) as { status: string, userId: string | null } | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a guest reserves online without an account (criterion 1, 3)', () => {
  test('the write path holds the seats as PENDING against a freshly minted guest account', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const email = `guest-${crypto.randomUUID().slice(0, 8)}@example.invalid`

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 2 }],
      guest: { name: 'Alex Booker', email },
    }, '')

    expect(answered.status).toBe(200)
    const body = await answered.json() as { reference: string, status: string, tickets: unknown[], totalPence: number }
    expect(body.status).toBe('PENDING')
    expect(body.tickets).toHaveLength(2)
    expect(body.totalPence).toBe(1800)

    const row = reservationFor(body.reference)
    expect(row?.status).toBe('PENDING')
    expect(row?.userId).not.toBeNull()
  }, CASE_TIMEOUT_MS)

  test('a guest can complete the whole flow through the real booking page', async () => {
    const { performanceId } = await bookableShow()

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/book/${performanceId}`, '[data-test="book-page"]')

    await fillNumber(view, '[data-test^="quantity-"]', '1')
    await fill(view, '[data-test="guest-name"]', 'Sam Guest')
    await fill(view, '[data-test="guest-email"]', `sam-${crypto.randomUUID().slice(0, 8)}@example.invalid`)

    await click(view, '[data-test="booking-submit"]')
    await waitFor(view, `document.querySelector('[data-test="booking-confirmed"]')`)
    expect(await textOf(view, '[data-test="booking-confirmed"]')).toContain('Reference')
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('an order over the cap is refused (criterion 2)', () => {
  test('a single line over the cap is refused, quoting the box office', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 11 }],
      guest: { name: 'Big Party', email: `party-${crypto.randomUUID().slice(0, 8)}@example.invalid` },
    }, '')

    expect(answered.status).toBe(400)
    expect(await answered.text()).toContain('box office')
  })
})

describe.skipIf(skip !== null)('booking is refused with a stated reason (criterion 4)', () => {
  test('a performance past its booking window refuses online and names the door', async () => {
    const { performanceId, ticketTypeId } = await bookableShow({ bookingClosesHoursBefore: 24 * 7 * 2 })

    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Late Booker', email: `late-${crypto.randomUUID().slice(0, 8)}@example.invalid` },
    }, '')

    expect(answered.status).toBe(409)
    expect(await answered.text()).toContain('closed')
  })
})

describe.skipIf(skip !== null)('the last seat cannot be sold twice (D-105 criterion 1)', () => {
  test('two orders for a one-seat house leave exactly one winner', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
      venueId, startsAt: nextWeek(), capacityOverride: 1, intervalCount: 0,
    })).status).toBe(200)

    const order = () => send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Racer', email: `race-${crypto.randomUUID().slice(0, 8)}@example.invalid` },
    }, '')

    const [first, second] = await Promise.all([order(), order()])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])
  })
})
