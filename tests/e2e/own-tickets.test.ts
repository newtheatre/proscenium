import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1332: a signed-in person finds their own tickets and shows their pass without an email to
// hand: the pass's QR on /account/passes, their bookings on /qr and on a My NNT tile.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  boxOffice = await registerMember(app, 'boxoffice', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'FOH_MANAGER' }, officer.cookie)

  const database = new Database(app.databaseFile)
  try {
    venueId = testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(as ? { cookie: as } : {}) },
    redirect: 'manual',
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const now = Math.floor(Date.now() / 1000)

async function bookableShow(): Promise<{ title: string, performanceId: string, ticketTypeId: string }> {
  const title = named('Hedda Gabler')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: now + 7 * 86_400 })
  const performanceId = (await performance.json() as { id: string }).id
  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)
  return { title, performanceId, ticketTypeId }
}

async function signedInView(member: TestMember, password: string): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', member.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
  return view
}

async function heldPass(holder: TestMember): Promise<{ passId: string }> {
  const title = named('Rosmersholm')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id
  const name = named('Season pass')
  const created = await send('POST', '/api/admin/pass-types', {
    name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400, prices: [{ label: 'Standard', price: 4500 }], showIds: [showId],
  })
  const { id: passTypeId } = await created.json() as { id: string }
  await send('PUT', `/api/admin/pass-types/${passTypeId}`, {
    name, slug: slugged(name), validFrom: now, validUntil: now + 180 * 86_400, prices: [{ label: 'Standard', price: 4500 }], status: 'ON_SALE',
  })
  const detail = await send('GET', `/api/admin/pass-types/${passTypeId}`)
  const { passType } = await detail.json() as { passType: { prices: { id: string }[] } }
  const issued = await send('POST', '/api/box-office/desk/passes', {
    passTypeId, passTypePriceId: passType.prices[0]!.id, userId: holder.id, expectedTotalPence: 4500,
  }, boxOffice.cookie)
  expect(issued.status).toBe(200)
  return await issued.json() as { passId: string }
}

describe.skipIf(skip !== null)('a signed-in person\'s own bookings (issue 1332)', () => {
  test('the account lists its bookings to come, each opening its own booking page', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const member = await registerMember(app, 'booker', generatePassword())
    const booked = await send('POST', '/api/reservations', { performanceId, lines: [{ ticketTypeId, quantity: 1 }] }, member.cookie)
    const { reference } = await booked.json() as { reference: string }

    const listed = await send('GET', '/api/account/bookings', undefined, member.cookie)
    expect(listed.status).toBe(200)
    const { bookings } = await listed.json() as { bookings: { reference: string, url: string }[] }
    const mine = bookings.find(one => one.reference === reference)
    expect(mine?.url).toMatch(/^\/qr\/\S+$/)

    const opened = await send('GET', mine!.url, undefined, '')
    const cookie = (opened.headers.get('set-cookie') ?? '').split(';')[0]!
    const current = await send('GET', '/api/qr/current', undefined, cookie)
    expect((await current.json() as { reference: string }).reference).toBe(reference)

    expect((await send('GET', '/api/account/bookings', undefined, '')).status).toBe(401)
  }, CASE_TIMEOUT_MS)

  test('/qr lists them for a signed-in visitor with no booking open, and My NNT shows the next', async () => {
    const { title, performanceId, ticketTypeId } = await bookableShow()
    const password = generatePassword()
    const member = await registerMember(app, 'booker', password)
    const booked = await send('POST', '/api/reservations', { performanceId, lines: [{ ticketTypeId, quantity: 1 }] }, member.cookie)
    const { reference } = await booked.json() as { reference: string }

    const view = await signedInView(member, password)
    try {
      await visit(view, `${app.baseURL}/qr`, '[data-test="qr-own-bookings"]')
      const listed = await textOf(view, '[data-test="qr-own-bookings"]')
      expect(listed).toContain(reference)
      expect(listed).toContain(title)

      await visit(view, `${app.baseURL}/my`, '[data-test="my-page"]')
      await waitFor(view, `document.querySelector('[data-test="my-tile-tickets"]')`)
      expect(await textOf(view, '[data-test="my-tile-tickets"]')).toContain(title)

      // One link, and it loads the booking's link route: routed in the app it would find no page.
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="my-tile-tickets"] a').length`)).toBe(1)
      await click(view, '[data-test="my-tile-tickets"] a')
      await waitFor(view, `location.pathname === '/qr' && document.body.innerText.includes('${reference}')`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Opening one booking sets an hour-long cookie that /qr then shows, so the rest must stay in reach.
  test('with one booking open, /qr still lists the others', async () => {
    const first = await bookableShow()
    const second = await bookableShow()
    const password = generatePassword()
    const member = await registerMember(app, 'booker', password)
    const book = async (show: { performanceId: string, ticketTypeId: string }): Promise<string> => {
      const booked = await send('POST', '/api/reservations', { performanceId: show.performanceId, lines: [{ ticketTypeId: show.ticketTypeId, quantity: 1 }] }, member.cookie)
      return (await booked.json() as { reference: string }).reference
    }
    const firstReference = await book(first)
    const secondReference = await book(second)

    const listed = await send('GET', '/api/account/bookings', undefined, member.cookie)
    const { bookings } = await listed.json() as { bookings: { reference: string, url: string }[] }
    const firstUrl = bookings.find(one => one.reference === firstReference)!.url

    const view = await signedInView(member, password)
    try {
      await visit(view, `${app.baseURL}${firstUrl}`, '[data-test="booking-found"]')
      await visit(view, `${app.baseURL}/qr`, '[data-test="qr-own-bookings"]')
      expect(await textOf(view, '[data-test="booking-found"]')).toContain(firstReference)
      const others = await textOf(view, '[data-test="qr-own-bookings"]')
      expect(others).toContain(secondReference)
      expect(others).not.toContain(firstReference)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a signed-in holder shows their pass from their account (issue 1332)', () => {
  test('/account/passes carries each active pass\'s QR, and /passes sends a signed-in visitor there', async () => {
    const password = generatePassword()
    const holder = await registerMember(app, 'holder', password)
    const { passId } = await heldPass(holder)

    const listed = await send('GET', '/api/account/passes', undefined, holder.cookie)
    const { passes } = await listed.json() as { passes: { id: string, qrSvg: string | null }[] }
    expect(passes.find(one => one.id === passId)?.qrSvg?.length ?? 0).toBeGreaterThan(0)

    const view = await signedInView(holder, password)
    try {
      await visit(view, `${app.baseURL}/account/passes`, '[data-test="account-passes-page"]')
      await waitFor(view, `document.querySelector('[data-test="account-pass-qr-${passId}"]')`)
      expect(await textOf(view, '[data-test="account-passes-held"]')).toContain('Show at the door')

      await visit(view, `${app.baseURL}/passes`)
      await waitFor(view, `location.pathname === '/account/passes'`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
