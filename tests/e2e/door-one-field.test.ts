import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Issue 1301 through the real routes and the real screen: one field takes a reference or a name,
// a name lists tonight's tickets to admit, and a miss is amber rather than a red refusal.

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
  door = await registerMember(app, 'door-one-field', doorPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: door.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const target = sqliteTarget(database)
    ticketTypeFixture(target)
    const venueId = testVenue(target, { suffix: 'door-one-field' }).id
    performanceId = tonightsPerformance(target, { suffix: 'door-one-field', venueId }).performanceId
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

function booking(status: string, holderName: string, seats = 1): string {
  counter += 1
  const id = `r-door-field-${counter}`
  const userId = `u-door-field-${counter}`
  const reference = `FLD${String(counter).padStart(3, '0')}`
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)').run(userId, holderName, `${userId}@e2e.newtheatre.org.uk`)
    database.query('INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, reference, performanceId, userId, status, 'WEB')
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

async function signIn(view: Bun.WebView): Promise<void> {
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', door.email)
  await fill(view, 'form input[type="password"]', doorPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
}

describe.skipIf(skip !== null)('the ticket lookup behind the one field (issue 1301)', () => {
  test('a name finds tonight\'s tickets with a first name, a count and paid or unpaid, and no surname', async () => {
    const paid = booking('COLLECTED', 'Oriel Fairweather', 2)
    const unpaid = booking('PENDING', 'Oriel Fairweather', 1)
    const answered = await send('GET', `/api/tonight/door/tickets/search?q=oriel&performanceId=${performanceId}`)
    expect(answered.status).toBe(200)

    const { items } = await answered.json() as { items: { reference: string, firstName: string, partySize: number, state: string }[] }
    expect(items.map(item => [item.reference, item.firstName, item.partySize, item.state])).toEqual([
      [paid, 'Oriel', 2, 'PAID'],
      [unpaid, 'Oriel', 1, 'UNPAID'],
    ])
    expect(JSON.stringify(items)).not.toContain('Fairweather')
  }, CASE_TIMEOUT_MS)

  test('the lookup carries the door\'s own authority, and nobody else\'s', async () => {
    const stranger = await registerMember(app, 'door-one-field-stranger', generatePassword())
    const answered = await send('GET', `/api/tonight/door/tickets/search?q=oriel&performanceId=${performanceId}`, undefined, stranger.cookie)
    expect(answered.status).toBe(403)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the door screen, with one field (issue 1301)', () => {
  test('a typed name lists the booking, and Admit shows the verdict', async () => {
    const reference = booking('COLLECTED', 'Tamsin Oakley', 3)
    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="door-screen"]')
      await waitFor(view, `document.querySelector('[data-test="door-reference"]')`)

      await fill(view, '[data-test="door-reference"]', 'Tamsin')
      await click(view, '[data-test="door-scan"]')
      await waitFor(view, `document.querySelector('[data-test="door-ticket-${reference}"]')`)
      expect(await textOf(view, `[data-test="door-ticket-${reference}"]`)).toContain('Tamsin · party of 3')

      await click(view, `[data-test="door-ticket-admit-${reference}"]`)
      await waitFor(view, `document.querySelector('[data-test="door-verdict-paid"]')`)
      expect(await textOf(view, '[data-test="door-verdict"]')).toContain(reference)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('an unpaid booking found by name is sent to the bar with its ticket, and offers no Admit', async () => {
    const reference = booking('PENDING', 'Wendell Ashby', 1)
    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="door-screen"]')
      await waitFor(view, `document.querySelector('[data-test="door-reference"]')`)

      await fill(view, '[data-test="door-reference"]', 'Wendell')
      await click(view, '[data-test="door-scan"]')
      await waitFor(view, `document.querySelector('[data-test="door-ticket-${reference}"]')`)
      expect(await textOf(view, `[data-test="door-ticket-line-${reference}"]`)).toBe('Send to the bar with this ticket')
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="door-ticket-admit-${reference}"]').length`)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a name nobody booked under is amber, not a red refusal', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="door-screen"]')
      await waitFor(view, `document.querySelector('[data-test="door-reference"]')`)

      await fill(view, '[data-test="door-reference"]', 'Nobody Byname')
      await click(view, '[data-test="door-scan"]')
      await waitFor(view, `document.querySelector('[data-test="door-verdict-miss"]')`)
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="door-verdict-refused"]').length`)).toBe(0)
      expect(await textOf(view, '[data-test="door-verdict"]')).toContain('NOT FOUND')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the door carries no Challenge 25 button: the register is the hub\'s tile', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await signIn(view)
      await visit(view, `${app.baseURL}/tonight/door`, '[data-test="door-screen"]')
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="link-age-checks"]').length`)).toBe(0)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
