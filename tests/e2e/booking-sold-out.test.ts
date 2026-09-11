import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { click, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-101 criterion 2 on the booking screen: an old link to a full house refuses up front, with the
// waiting-list entry point the show page already offers, rather than 409ing at submit.

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

// Seats one, so a single reservation fills the house.
function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 1 }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

async function bookableShow(): Promise<{ performanceId: string, ticketTypeId: string }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, ticketTypeId }
}

async function fillTheHouse(performanceId: string, ticketTypeId: string): Promise<void> {
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Ada Filler', email: `filler-${crypto.randomUUID().slice(0, 8)}@example.invalid` },
  }, '')
  expect(answered.status).toBe(200)
}

describe.skipIf(skip !== null)('a sold-out performance refuses the booking form up front', () => {
  test('the booking route answers a capacity refusal carrying the waiting-list link', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()

    const open = await (await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')).json() as {
      refusal: unknown
      ticketTypes: unknown[]
    }
    expect(open.refusal).toBeNull()
    expect(open.ticketTypes.length).toBeGreaterThan(0)

    await fillTheHouse(performanceId, ticketTypeId)

    const full = await (await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')).json() as {
      refusal: { reason: string, says: string, waitingListUrl?: string } | null
      ticketTypes: unknown[]
    }
    expect(full.refusal?.reason).toBe('SOLD_OUT')
    expect(full.refusal?.says).toContain('sold out')
    expect(full.refusal?.waitingListUrl).toBe(`/waiting-list/${performanceId}`)

    // Nothing on sale is offered behind a refusal, so no quantity picker can be rendered at all.
    expect(full.ticketTypes).toHaveLength(0)
  }, CASE_TIMEOUT_MS)

  test('the booking page shows the sold-out state and links the waiting list', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    await fillTheHouse(performanceId, ticketTypeId)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${performanceId}`, '[data-test="book-page"]')

      expect(await textOf(view, '[data-test="booking-refused"]')).toContain('Sold out')
      await click(view, '[data-test="booking-waiting-list"]')
      await waitFor(view, `document.querySelector('[data-test="waiting-list-join-page"]')`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
