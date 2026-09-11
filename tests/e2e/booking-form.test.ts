import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-104 criteria 1 and 7 on the real screen: the three numbered steps, the performance picker, and
// validation that lands on the field it concerns rather than as a sentence naming a parameter.

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
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 120 }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

// Two nights, so the picker has something to pick between.
async function twoNightRun(): Promise<{ first: string, second: string }> {
  const title = named('Uncle Vanya')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const nights: string[] = []
  for (const offset of [0, 24]) {
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek(offset) })
    nights.push((await performance.json() as { id: string }).id)
  }

  await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { first: nights[0]!, second: nights[1]! }
}

describe.skipIf(skip !== null)('the booking screen is three numbered steps (criterion 7)', () => {
  test('the picker lists the run and moves the address to the night chosen', async () => {
    const { first, second } = await twoNightRun()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')

      await waitFor(view, `document.querySelector('[data-test="pick-performance"]')`)
      await waitFor(view, `document.querySelector('[data-test="night-${second}"]')`)
      expect(await textOf(view, '[data-test="booking-breadcrumb"]')).toContain('Book tickets')

      await click(view, `[data-test="night-${second}"]`)
      await waitFor(view, `location.pathname === '/book/${second}'`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the stub quotes the configured hold-release figure', async () => {
    const { first } = await twoNightRun()
    const answered = await (await send('GET', `/api/performances/${first}/booking`, undefined, '')).json() as { holdReleaseMinutes: number }
    expect(answered.holdReleaseMinutes).toBeGreaterThan(0)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')
      expect(await textOf(view, '[data-test="hold-release"]')).toContain(`${answered.holdReleaseMinutes} minutes before curtain`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a bad detail is refused on its own field, in house copy (criterion 1)', () => {
  test('an empty name and a malformed email each answer on the field', async () => {
    const { first } = await twoNightRun()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')
      await fillNumber(view, '[data-test^="quantity-"]', '1')

      await fill(view, '[data-test="guest-email"]', 'not-an-address')
      await click(view, '[data-test="booking-submit"]')
      await waitFor(view, `document.body.innerText.includes('does not look like an email address')`)

      const body = await textOf(view)
      expect(body).toContain('Tell us the name the booking is under.')
      expect(body).not.toContain('Invalid request')
      expect(body).not.toContain('Too small')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
