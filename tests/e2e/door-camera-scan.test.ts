import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-129 through the real routes and the real screen: what a decoded code resolves to, and what
// the door shows once it has. The camera itself is not driveable here, which criterion 5 covers.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let doorPassword: string
let door: TestMember
let performanceId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  doorPassword = generatePassword()
  door = await registerMember(app, 'door-camera', doorPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    ticketTypeFixture(target)
    const venueId = testVenue(target, { suffix: 'door-camera' }).id
    performanceId = tonightsPerformance(target, { suffix: 'door-camera', venueId }).performanceId
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

let counter = 0

function booking(status: string, holderId: string | null = null, seats = 1): string {
  counter += 1
  const id = `r-door-camera-${counter}`
  const reference = `CAM${String(counter).padStart(3, '0')}`
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, reference, performanceId, holderId, status, 'WEB')
    for (let seat = 0; seat < seats; seat += 1) {
      database.query('INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`t-${id}-${seat}`, id, performanceId, 'tt-standard', 900, 'BASE')
    }
  }
  finally {
    database.close()
  }
  return reference
}

const resolve = (scanned: string): Promise<Response> =>
  send('POST', '/api/tonight/door/resolve', { scanned, performanceId })

describe.skipIf(skip !== null)('a decoded code resolves to the reference the door already scans (criterion 2)', () => {
  test('the /t/<ref> form the design names resolves to that reference', async () => {
    const reference = booking('COLLECTED')
    const answered = await resolve(`${app.baseURL}/t/${reference}`)
    expect(answered.status).toBe(200)
    expect((await answered.json() as { reference: string }).reference).toBe(reference)
  }, CASE_TIMEOUT_MS)

  test('a bare reference resolves to itself, so a hardware scanner keeps working', async () => {
    const reference = booking('COLLECTED')
    expect((await (await resolve(reference)).json() as { reference: string }).reference).toBe(reference)
  }, CASE_TIMEOUT_MS)

  test('a booking token is verified here, and a forged one never names a booking', async () => {
    const answered = await resolve(`${app.baseURL}/qr/r-door-camera-1.bm90LWEtc2lnbmF0dXJl`)
    expect(answered.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('a code that is none of ours is refused as such, not as a missing booking', async () => {
    expect((await resolve('https://example.com/somewhere-else')).status).toBe(422)
  }, CASE_TIMEOUT_MS)

  test('resolving carries the door\'s own authority, and nobody else\'s', async () => {
    const stranger = await registerMember(app, 'door-camera-stranger', generatePassword())
    const answered = await send('POST', '/api/tonight/door/resolve', { scanned: 'K7M4PQ', performanceId }, stranger.cookie)
    expect(answered.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the verdict the door shows (criterion 7)', () => {
  test('an admitted booking answers PAID, with the party and without a figure', async () => {
    const reference = booking('COLLECTED', door.id, 3)
    const answered = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId })
    expect(answered.status).toBe(200)

    const scanned = await answered.json() as {
      reference: string
      verdict: { state: string, headline: string, line: string }
      partySize: number
    }
    expect(scanned.verdict.state).toBe('PAID')
    expect(scanned.verdict.line).toBe('All collected, admit')
    expect(scanned.reference).toBe(reference)
    expect(scanned.partySize).toBe(3)
    expect(JSON.stringify(scanned.verdict)).not.toContain('£')
  }, CASE_TIMEOUT_MS)

  test('an unpaid booking answers UNPAID pointing at the bar, with no amount in the verdict', async () => {
    const reference = booking('PENDING', door.id, 2)
    const answered = await send('POST', '/api/tonight/door/tickets/scan', { reference, performanceId })
    expect(answered.status).toBe(409)

    const refused = await answered.json() as { data: { verdict: { state: string, line: string }, partySize: number } }
    expect(refused.data.verdict.state).toBe('UNPAID')
    expect(refused.data.verdict.line).toBe('Send to the bar to pay')
    expect(JSON.stringify(refused.data.verdict)).not.toContain('£')
    expect(refused.data.partySize).toBe(2)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the screen, with no camera to open (criteria 5, 7)', () => {
  test('the door falls back to the typed field, then shows the verdict card for a decoded value', async () => {
    const reference = booking('COLLECTED', door.id, 2)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', door.email)
      await fill(view, 'form input[type="password"]', doorPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      // The headless view opens no camera, which is exactly criterion 5's fallback.
      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="door-screen"]')
      await waitFor(view, `document.querySelector('[data-test="door-reference"]')`)
      expect(await textOf(view, '[data-test="door-camera-note"]')).toContain('type the reference')

      // The value a decode hands the screen, put in by hand: the resolve route turns it into the
      // reference, and the same admission path runs from there.
      await fill(view, '[data-test="door-reference"]', `${app.baseURL}/t/${reference}`)
      await click(view, '[data-test="door-scan"]')
      await waitFor(view, `document.querySelector('[data-test="door-verdict-paid"]')`)

      const card = await textOf(view, '[data-test="door-verdict"]')
      expect(card).toContain('PAID')
      expect(card).toContain('All collected, admit')
      expect(card).toContain('party of 2')
      expect(card).toContain(reference)
      expect(card).not.toContain('£')
      expect(card).toContain('Door mode')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
