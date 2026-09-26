import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { click, fill, fillNumber, letters, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
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
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek(offset), durationMinutes: 120 })
    nights.push((await performance.json() as { id: string }).id)
  }

  await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { first: nights[0]!, second: nights[1]! }
}

// A show carrying age guidance and one staging warning, so every place the guidance travels has
// something to say (issue 1330).
async function guidedShow(): Promise<{ performanceId: string, ticketTypeId: string, slug: string, warning: string }> {
  const title = named('Macbeth')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title), ageGuidance: 'Recommended 14 and over' })
  const showId = (await show.json() as { id: string }).id

  const warning = named('Strobe lighting')
  const created = await send('POST', '/api/admin/content-warnings', { title: warning, slug: slugged(warning), kind: 'TECHNICAL' })
  const warningId = (await created.json() as { id: string }).id
  expect((await send('PUT', `/api/admin/shows/${showId}/warnings`, {
    confirmedNone: false,
    warnings: [{ warningId, level: null }],
  })).status).toBe(200)

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek() })
  const performanceId = (await performance.json() as { id: string }).id
  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, ticketTypeId, slug: slugged(title), warning }
}

// D-102 criterion 4: what's on goes straight to the booking form, so the form, the booking page
// and the email each carry the guidance from the show's own rows, never re-entered.
describe.skipIf(skip !== null)('age guidance and warnings travel with the booking (D-102 criterion 4)', () => {
  test('the booking form says them before you book, with the show page one tap away', async () => {
    const { performanceId, slug, warning } = await guidedShow()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${performanceId}`, '[data-test="book-page"]')
      await waitFor(view, `document.querySelector('[data-test="before-you-book"]')`)
      const said = await textOf(view, '[data-test="before-you-book"]')
      expect(said).toContain('Before you book')
      expect(said).toContain('Age guidance: Recommended 14 and over')
      expect(said).toContain(warning)
      expect(await view.evaluate<string>(`document.querySelector('[data-test="before-you-book"] a')?.getAttribute('href') ?? ''`)).toBe(`/shows/${slug}`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the booking page and the confirmation email say them too', async () => {
    const { performanceId, ticketTypeId, warning } = await guidedShow()
    const email = `macduff-${crypto.randomUUID().slice(0, 8)}@example.com`
    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Lady Macduff', email },
    }, '')
    expect(answered.status).toBe(200)
    const { reference, qrToken } = await answered.json() as { reference: string, qrToken: string }

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await waitFor(view, `document.querySelector('[data-test="before-you-book"]')`)
      const said = await textOf(view, '[data-test="before-you-book"]')
      expect(said).toContain('Age guidance: Recommended 14 and over')
      expect(said).toContain(warning)
    }
    finally {
      view.close()
    }

    const letter = (await letters(app)).find(text => text.includes(reference))
    expect(letter).toBeDefined()
    expect(letter).toContain('Age guidance: Recommended 14 and over')
    expect(letter).toContain(warning)
  }, CASE_TIMEOUT_MS)

  // Guidance is for somebody still coming: a cancelled booking admits nobody, so it says nothing.
  test('a cancelled booking\'s page no longer says it', async () => {
    const { performanceId, ticketTypeId } = await guidedShow()
    const answered = await send('POST', '/api/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Banquo', email: `banquo-${crypto.randomUUID().slice(0, 8)}@example.com` },
    }, '')
    const { qrToken } = await answered.json() as { qrToken: string }

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await waitFor(view, `document.querySelector('[data-test="before-you-book"]')`)
      await click(view, '[data-test="booking-cancel-start"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-cancel-booking-verb"]')`)
      await click(view, '[data-test="confirm-cancel-booking-verb"]')
      await waitFor(view, `document.querySelector('[data-test="booking-status"]')?.textContent.includes('Cancelled')`)
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="before-you-book"]') === null`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

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
      // Every quantity field names its ticket type for a screen reader (issue 1023).
      const unnamed = await view.evaluate<number>(`[...document.querySelectorAll('[data-test^="quantity-"]')].map(node => node.matches('input') ? node : node.querySelector('input')).filter(input => input && !input.labels?.length && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')).length`)
      expect(unnamed).toBe(0)
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

// Issue 1152 item 4, D-104 criterion 8: what the screen tells a mouse it also tells a keyboard, a
// screen reader and a phone, and the confirmation says where the booking has been sent.
describe.skipIf(skip !== null)('the screen answers everybody the same way (criterion 8)', () => {
  test('each night says its own availability and the chosen one carries a word', async () => {
    const { first, second } = await twoNightRun()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')
      await waitFor(view, `document.querySelector('[data-test="night-${second}"]')`)

      expect(await textOf(view, `[data-test="night-${first}"]`)).toContain('Booking this night')
      expect(await textOf(view, `[data-test="night-${second}"]`)).toContain('Tickets available')
      expect(await textOf(view, `[data-test="night-${second}"]`)).not.toContain('Booking this night')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a refusal to reserve is announced and named by the button that refused', async () => {
    const { first } = await twoNightRun()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')
      await click(view, '[data-test="booking-submit"]')
      await waitFor(view, `document.querySelector('[data-test="booking-notice"]')`)

      const seen = await view.evaluate<string>(`JSON.stringify((() => {
        const live = document.querySelector('[data-test="booking-live"]')
        const submit = document.querySelector('[data-test="booking-submit"]')
        const described = (submit?.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean)
        return {
          announced: live?.getAttribute('role') ?? null,
          names: described.map(id => document.getElementById(id) !== null),
          notice: document.querySelector('[data-test="booking-notice"]')?.id ?? null,
          describedBy: described,
        }
      })())`)
      const read = JSON.parse(seen) as { announced: string | null, names: boolean[], notice: string | null, describedBy: string[] }

      expect(read.announced).toBe('alert')
      expect(read.notice).not.toBeNull()
      expect(read.describedBy).toContain(read.notice!)
      expect(read.names.every(Boolean)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the confirmation names the address the booking has gone to', async () => {
    const { first } = await twoNightRun()
    const address = `vanya-${crypto.randomUUID().slice(0, 8)}@example.com`

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${first}`, '[data-test="book-page"]')
      await fillNumber(view, '[data-test^="quantity-"]', '1')
      await fill(view, '[data-test="guest-name"]', 'Sonya Serebryakova')
      await fill(view, '[data-test="guest-email"]', address)
      await click(view, '[data-test="booking-submit"]')
      await waitFor(view, `document.querySelector('[data-test="booking-confirmed"]')`)

      const confirmed = await textOf(view, '[data-test="booking-confirmed"]')
      expect(confirmed).toContain(address)
      expect(confirmed).toContain('emailed')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a signed-out visitor looking at a member price is offered the way in', async () => {
    const title = named('The Seagull')
    const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
    const showId = (await show.json() as { id: string }).id
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek(), durationMinutes: 120 })
    const performanceId = (await performance.json() as { id: string }).id
    await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
    await send('POST', '/api/admin/ticket-types', { name: named('Member'), price: 400, restrictedTo: 'MEMBER' })
    expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/book/${performanceId}`, '[data-test="book-page"]')
      await waitFor(view, `document.querySelector('[data-test="member-prices"]')`)
      expect(await textOf(view, '[data-test="member-prices"]')).toContain('member')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
