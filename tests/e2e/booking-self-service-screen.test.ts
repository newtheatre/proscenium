import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { registrableAddress } from '#tests/helpers/seed'
import { click, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1152 item 5 on the real booking screen: the exchange list names its nights by date, a
// form's way out reads differently from cancelling, and the edit form is priced and capped.

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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

// Two nights, so the exchange form has somewhere to send the booking.
async function twoNightBooking(): Promise<{ qrToken: string, reference: string, performanceId: string }> {
  const title = named('Twelfth Night')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const nights: string[] = []
  for (const offset of [0, 24]) {
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek(offset), durationMinutes: 120 })
    nights.push((await performance.json() as { id: string }).id)
  }

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  const answered = await send('POST', '/api/reservations', {
    performanceId: nights[0],
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Viola Messaline', email: registrableAddress('guest') },
  }, '')
  expect(answered.status).toBe(200)
  const held = await answered.json() as { qrToken: string, reference: string }
  return { ...held, performanceId: nights[0]! }
}

describe.skipIf(skip !== null)('the booking screen says which night and which way out', () => {
  test('the exchange list names every night by its date', async () => {
    const { qrToken } = await twoNightBooking()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await click(view, '[data-test="booking-exchange-start"]')
      await waitFor(view, `document.querySelector('[data-test="booking-exchange-options"]')`)

      // "Wed 14 Oct, 19:30", the short London form lists use everywhere else.
      expect(await textOf(view, '[data-test="booking-exchange-options"]')).toMatch(/\w{3}\s\d{1,2}\s\w{3},\s\d{2}:\d{2}/)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a form\'s way out is Back, and the only Cancel names what it cancels', async () => {
    const { qrToken } = await twoNightBooking()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await click(view, '[data-test="booking-edit-start"]')
      await waitFor(view, `document.querySelector('[data-test="booking-edit-form"]')`)

      const ways = await view.evaluate<string>(`JSON.stringify(
        [...document.querySelectorAll('[data-test="booking-edit-form"] button')].map(button => button.textContent.trim()))`)
      const labels = JSON.parse(ways) as string[]
      expect(labels).toContain('Back')
      expect(labels).not.toContain('Cancel')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('cancelling opens the one confirmation, with the consequence on it', async () => {
    const { qrToken } = await twoNightBooking()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await click(view, '[data-test="booking-cancel-start"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-cancel-booking-verb"]')`)

      expect(await textOf(view, '[data-test="confirm-cancel-booking-verb"]')).toBe('Cancel this booking')
      expect(await textOf(view)).toContain('back on sale')

      await click(view, '[data-test="confirm-cancel-booking-back"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-cancel-booking-verb"]') === null`)
      expect(await textOf(view, '[data-test="booking-status"]')).not.toContain('Cancelled')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Issue 1329: one cookie names one booking, and opening or making another moves it. A page
  // still showing the first is refused rather than cancelling the second behind its back.
  test('cancelling from a page showing one booking never cancels another the cookie now names', async () => {
    const first = await twoNightBooking()
    const second = await twoNightBooking()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${first.qrToken}`, '[data-test="booking-found"]')
      expect(await view.evaluate<number>(`fetch('/qr/${second.qrToken}').then(response => response.status)`)).toBe(200)

      await click(view, '[data-test="booking-cancel-start"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-cancel-booking-verb"]')`)
      await click(view, '[data-test="confirm-cancel-booking-verb"]')
      await waitFor(view, `document.body.innerText.includes('This page is showing a different booking')`)
    }
    finally {
      view.close()
    }

    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const statuses = database.query('SELECT reference, status FROM reservations WHERE reference IN (?, ?)')
        .all(first.reference, second.reference) as { reference: string, status: string }[]
      expect(statuses.map(row => row.status)).toEqual(['PENDING', 'PENDING'])
    }
    finally {
      database.close()
    }
  }, CASE_TIMEOUT_MS)

  // Issue 1329: a cancelled booking admits nobody, so its code is not offered to be saved.
  test('a cancelled booking shows no QR code', async () => {
    const { qrToken } = await twoNightBooking()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="booking-qr"]') !== null`)).toBe(true)

      await click(view, '[data-test="booking-cancel-start"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-cancel-booking-verb"]')`)
      await click(view, '[data-test="confirm-cancel-booking-verb"]')
      await waitFor(view, `document.querySelector('[data-test="booking-status"]')?.textContent.includes('Cancelled')`)

      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="booking-qr"]') === null`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the edit form prices every type and caps it at the order cap', async () => {
    const { qrToken, performanceId } = await twoNightBooking()
    const { cap } = await (await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')).json() as { cap: number }

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr/${qrToken}`, '[data-test="booking-found"]')
      await click(view, '[data-test="booking-edit-start"]')
      await waitFor(view, `document.querySelector('[data-test="booking-edit-form"]')`)

      expect(await textOf(view, '[data-test="booking-edit-form"]')).toContain('£9.00')

      const maxima = await view.evaluate<string>(`JSON.stringify(
        [...document.querySelectorAll('[data-test^="booking-edit-quantity-"] input')].map(input => input.getAttribute('max')))`)
      for (const max of JSON.parse(maxima) as (string | null)[]) {
        expect(max).toBe(String(cap))
      }
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the resend card carries one heading, not two', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/qr`, '[data-test="qr-resend"]')
      const headings = await view.evaluate<number>(`document.querySelectorAll('[data-test="qr-resend"] h1, [data-test="qr-resend"] h2, [data-test="qr-resend"] h3').length`)
      expect(headings).toBe(1)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
