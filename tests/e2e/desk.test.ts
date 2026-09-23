import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, forgetSpentStep, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import { showNightOf } from '#shared/utils/show-night'
import { codeForStep, stepFor } from '#shared/utils/totp'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-114 through the real routes. The ticket-collection-once guard's own SQL is pinned in
// tests/integration/desk.test.ts, ahead of the migration landing.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let boxOfficePassword: string
let manager: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  boxOfficePassword = generatePassword()
  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'FOH_MANAGER' }, officer.cookie)

  // Both roles, plus MFA: MANAGER is privileged (0037/A-112). ticketing.manage is now what
  // decides a comp request rather than what collects one (D-117).
  const managerPassword = generatePassword()
  manager = await registerMember(app, 'manager', managerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'FOH_MANAGER' }, officer.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: manager.id, role: 'MANAGER' }, officer.cookie)

  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, manager.cookie)).json() as { secret: string }
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, manager.cookie)
  forgetSpentStep(app, manager.email)
  const { attemptId } = await (await request(app, 'POST', '/api/auth/sign-in', { email: manager.email, password: managerPassword })).json() as { attemptId: string }
  const managerAnswered = await request(app, 'POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  manager = { ...manager, cookie: (managerAnswered.headers.get('set-cookie') ?? '').split(';')[0]! }

  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = boxOffice.cookie): Promise<Response> =>
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

function query<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function queryAll<T>(statement: string, ...parameters: unknown[]): T[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).all(...parameters as never[]) as T[]
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const weekOffsetSeconds = 7 * 86_400

// The offset is a parameter because the desk screen opens on tonight and nothing else: a case
// driving the screen needs a performance inside the night in progress, not one a week out.
async function bookableShow(price = 900, offsetSeconds = weekOffsetSeconds): Promise<{ performanceId: string, ticketTypeId: string, startsAt: number, night: string }> {
  const title = named('The Seagull')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + offsetSeconds
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt }, officer.cookie)
  const performanceId = (await performance.json() as { id: string }).id

  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }, officer.cookie)
  const ticketTypeId = (await type.json() as { id: string }).id

  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

  return { performanceId, ticketTypeId, startsAt, night: showNightOf(new Date(startsAt * 1000)) }
}

async function bookedReservation(performanceId: string, ticketTypeId: string, quantity = 1): Promise<{ reference: string, id: string, qrToken: string, totalPence: number }> {
  const email = registrableAddress('guest')
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity }],
    guest: { name: 'Desk Tester', email },
  }, '')
  expect(answered.status).toBe(200)
  const body = await answered.json() as { reference: string, qrToken: string, totalPence: number }
  const row = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', body.reference)!
  return { ...body, id: row.id }
}

describe.skipIf(skip !== null)('the desk finds today\'s performance and browses to its neighbours (criterion 1)', () => {
  test('the performance appears on its own night and not on the ones either side', async () => {
    const { performanceId, night } = await bookableShow()

    const onNight = await send('GET', `/api/box-office/desk/performances?night=${night}`)
    expect(onNight.status).toBe(200)
    const body = await onNight.json() as { night: string, previousNight: string, nextNight: string, performances: { id: string }[] }
    expect(body.performances.some(p => p.id === performanceId)).toBe(true)
    expect(body.previousNight < body.night).toBe(true)
    expect(body.night < body.nextNight).toBe(true)

    const dayBefore = await send('GET', `/api/box-office/desk/performances?night=${body.previousNight}`)
    const beforeBody = await dayBefore.json() as { performances: { id: string }[] }
    expect(beforeBody.performances.some(p => p.id === performanceId)).toBe(false)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('finding a booking by reference, name or a scanned code (criterion 1)', () => {
  test('a reference finds exactly the one booking', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference } = await bookedReservation(performanceId, ticketTypeId)

    const found = await send('GET', `/api/box-office/desk/search?performanceId=${performanceId}&q=${reference}`)
    const body = await found.json() as { items: { reference: string }[] }
    expect(body.items.map(item => item.reference)).toEqual([reference])
  }, CASE_TIMEOUT_MS)

  test('a scanned QR resolves straight to the booking', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference, qrToken } = await bookedReservation(performanceId, ticketTypeId)

    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: `https://newtheatre.org.uk/qr/${qrToken}` })
    expect(scanned.status).toBe(200)
    const body = await scanned.json() as { reference: string }
    expect(body.reference).toBe(reference)
  }, CASE_TIMEOUT_MS)

  test('a code nobody signed says so, rather than resolving to something else', async () => {
    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: 'not-a-real-token' })
    expect(scanned.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('the /t/<ref> form a camera decodes resolves to that booking (criterion 8)', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference } = await bookedReservation(performanceId, ticketTypeId)

    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: `https://newtheatre.org.uk/t/${reference}` })
    expect(scanned.status).toBe(200)
    expect((await scanned.json() as { reference: string }).reference).toBe(reference)
  }, CASE_TIMEOUT_MS)

  test('a bare reference resolves to itself, so a hardware scanner keeps working (criterion 8)', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference } = await bookedReservation(performanceId, ticketTypeId)

    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: reference.toLowerCase() })
    expect(scanned.status).toBe(200)
    expect((await scanned.json() as { reference: string }).reference).toBe(reference)
  }, CASE_TIMEOUT_MS)

  test('a reference nobody holds is an unknown booking, in the same words as before', async () => {
    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: 'K7M4PQ' })
    expect(scanned.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  test('a pass is refused with the door named, since the desk collects bookings (criterion 8)', async () => {
    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: 'https://newtheatre.org.uk/passes/pass-1.c2ln' })
    expect(scanned.status).toBe(422)
    expect(await scanned.text()).toContain('door')
  }, CASE_TIMEOUT_MS)

  test('a code that is none of ours is refused as such, not as a missing booking (criterion 8)', async () => {
    const scanned = await send('POST', '/api/box-office/desk/scan', { scanned: 'https://example.com/somewhere-else' })
    expect(scanned.status).toBe(422)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('collection is the payment boundary (criteria 2, 3, 5, 6)', () => {
  test('a mismatch is refused quoting both figures, and nothing is charged', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const wrong = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 500,
      tender: 'CARD',
    })
    expect(wrong.status).toBe(409)
    const text = await wrong.text()
    expect(text).toContain('£5.00')
    expect(text).toContain('£9.00')

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', id)
    expect(row?.status).toBe('PENDING')
  }, CASE_TIMEOUT_MS)

  test('a card collection posts the ledger, clears the hold and cannot be repeated', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const collected = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 900,
      tender: 'CARD',
    })
    expect(collected.status).toBe(200)

    const row = query<{ status: string, holdExpiresAt: number | null }>(
      'SELECT status, hold_expires_at AS holdExpiresAt FROM reservations WHERE id = ?', id,
    )
    expect(row?.status).toBe('COLLECTED')
    expect(row?.holdExpiresAt).toBeNull()

    const lines = queryAll<{ kind: string, amountPence: number, unitPricePence: number }>(
      `SELECT l.kind AS kind, l.amount_pence AS amountPence, l.unit_price_pence AS unitPricePence
       FROM ledger_lines l JOIN tickets t ON t.id = l.ticket_id
       WHERE t.reservation_id = ?`, id,
    )
    expect(lines).toEqual([{ kind: 'TICKET_COLLECTION', amountPence: 900, unitPricePence: 900 }])

    const entry = query<{ source: string, tender: string }>(
      `SELECT e.source AS source, e.tender AS tender FROM ledger_entries e
       JOIN ledger_lines l ON l.entry_id = e.id JOIN tickets t ON t.id = l.ticket_id
       WHERE t.reservation_id = ?`, id,
    )
    expect(entry).toEqual({ source: 'DESK', tender: 'CARD' })

    const again = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 900,
      tender: 'CARD',
    })
    expect(again.status).toBe(409)
    expect(await again.text()).toContain('already been collected')
  }, CASE_TIMEOUT_MS)

  // D-117 replaced the standing ticketing.manage gate with a request-and-approval workflow;
  // the full request, approve, decline and race coverage lives in tests/e2e/ticket-comps.test.ts.
  test('an approved comp posts a zero-value entry, keeping the real price on the line (criterion 4)', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const asked = await send('POST', '/api/box-office/desk/comp-requests', { reservationId: id, reason: 'Reviewer' })
    const { id: requestId } = await asked.json() as { id: string }
    expect((await send('POST', `/api/box-office/desk/comp-requests/${requestId}/approve`, {}, manager.cookie)).status).toBe(200)

    const collected = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 0,
      tender: 'COMP',
      compRequestId: requestId,
    })
    expect(collected.status).toBe(200)

    const line = query<{ amountPence: number, unitPricePence: number }>(
      `SELECT l.amount_pence AS amountPence, l.unit_price_pence AS unitPricePence
       FROM ledger_lines l JOIN tickets t ON t.id = l.ticket_id WHERE t.reservation_id = ?`, id,
    )
    expect(line).toEqual({ amountPence: 0, unitPricePence: 900 })
  }, CASE_TIMEOUT_MS)

  test('a comp with no request named is refused before anything is written', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const refused = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 0,
      tender: 'COMP',
    })
    expect(refused.status).toBe(400)
  }, CASE_TIMEOUT_MS)

  test('a comp is refused without an approved request, even with a well-formed body (D-117)', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const asked = await send('POST', '/api/box-office/desk/comp-requests', { reservationId: id, reason: 'Reviewer' })
    const { id: requestId } = await asked.json() as { id: string }

    const refused = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 0,
      tender: 'COMP',
      compRequestId: requestId,
    })
    expect(refused.status).toBe(409)
    expect(await refused.text()).toContain('not been approved')

    const row = query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', id)
    expect(row?.status).toBe('PENDING')
  }, CASE_TIMEOUT_MS)

  test('the same booking, the same body: a card collection by an ordinary officer still works', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const collected = await send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 900,
      tender: 'CARD',
    })
    expect(collected.status).toBe(200)
  }, CASE_TIMEOUT_MS)

  test('two attempts at the same booking leave exactly one collection and one ledger entry', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { id } = await bookedReservation(performanceId, ticketTypeId)

    const attempt = () => send('POST', `/api/box-office/desk/reservations/${id}/collect`, {
      expectedTotalPence: 900,
      tender: 'CARD',
    })

    const [first, second] = await Promise.all([attempt(), attempt()])
    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([200, 409])

    const entries = queryAll<{ id: string }>(
      `SELECT DISTINCT e.id AS id FROM ledger_entries e
       JOIN ledger_lines l ON l.entry_id = e.id JOIN tickets t ON t.id = l.ticket_id
       WHERE t.reservation_id = ?`, id,
    )
    expect(entries).toHaveLength(1)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('a walk-up sale is one flow, source DOOR from creation (D-115)', () => {
  test('creates the reservation, takes payment and posts the ledger in one request', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)

    const sold = await send('POST', '/api/box-office/desk/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 2 }],
      guest: { name: 'Walk Up', email: registrableAddress('walkup') },
      expectedTotalPence: 1800,
      tender: 'CARD',
    })
    expect(sold.status).toBe(200)
    const body = await sold.json() as { reference: string, totalPence: number }
    expect(body.totalPence).toBe(1800)

    const row = query<{ status: string, source: string, windowBypassed: number }>(
      'SELECT status, source, window_bypassed AS windowBypassed FROM reservations WHERE reference = ?', body.reference,
    )
    expect(row).toEqual({ status: 'COLLECTED', source: 'DOOR', windowBypassed: 0 })

    const lines = queryAll<{ kind: string, amountPence: number, performanceId: string }>(
      `SELECT l.kind AS kind, l.amount_pence AS amountPence, l.performance_id AS performanceId
       FROM ledger_lines l JOIN tickets t ON t.id = l.ticket_id
       JOIN reservations r ON r.id = t.reservation_id WHERE r.reference = ?`, body.reference,
    )
    expect(lines).toEqual([
      { kind: 'WALK_UP', amountPence: 900, performanceId },
      { kind: 'WALK_UP', amountPence: 900, performanceId },
    ])
  }, CASE_TIMEOUT_MS)

  test('a mismatch is refused quoting both figures, and nothing is created (criterion 4)', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)

    const wrong = await send('POST', '/api/box-office/desk/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Walk Up', email: registrableAddress('walkup') },
      expectedTotalPence: 500,
      tender: 'CARD',
    })
    expect(wrong.status).toBe(409)
    const text = await wrong.text()
    expect(text).toContain('£5.00')
    expect(text).toContain('£9.00')

    const count = query<{ n: number }>('SELECT count(*) AS n FROM reservations WHERE performance_id = ?', performanceId)
    expect(count?.n).toBe(0)
  }, CASE_TIMEOUT_MS)

  test('sells past the customer window, and records that it did (D-112, D-115 criterion 3)', async () => {
    const title = named('The Seagull')
    const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) }, officer.cookie)
    const showId = (await show.json() as { id: string }).id

    const startsAt = Math.floor(Date.now() / 1000) + weekOffsetSeconds
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, {
      venueId, startsAt, bookingClosesHoursBefore: 24 * 8,
    }, officer.cookie)
    const performanceId = (await performance.json() as { id: string }).id

    const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 }, officer.cookie)
    const ticketTypeId = (await type.json() as { id: string }).id
    expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true }, officer.cookie)).status).toBe(200)

    const onSale = await send('GET', `/api/box-office/desk/performances?night=${showNightOf(new Date(startsAt * 1000))}`)
    expect((await onSale.json() as { performances: { id: string }[] }).performances.some(p => p.id === performanceId)).toBe(true)

    const sold = await send('POST', '/api/box-office/desk/reservations', {
      performanceId,
      lines: [{ ticketTypeId, quantity: 1 }],
      guest: { name: 'Walk Up', email: registrableAddress('walkup') },
      expectedTotalPence: 900,
      tender: 'CARD',
    })
    expect(sold.status).toBe(200)

    const row = query<{ windowBypassed: number }>(
      'SELECT window_bypassed AS windowBypassed FROM reservations WHERE performance_id = ?', performanceId,
    )
    expect(row?.windowBypassed).toBe(1)
  }, CASE_TIMEOUT_MS)
})

async function signInAsBoxOffice(baseURL: string): ReturnType<typeof openSignedOutView> {
  const view = await openSignedOutView(baseURL)
  await visit(view, `${baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', boxOffice.email)
  await fill(view, 'form input[type="password"]', boxOfficePassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)
  return view
}

// #899: the SSR fetch on a full page load carries no cookie unless it goes through
// useRequestFetch, and the failed nightly no longer resolves silently as an empty screen.
describe.skipIf(skip !== null)('opening the desk by a full page load (#899, #940)', () => {
  test('a bookmark or a refresh still shows tonight\'s night, the picker and its bookings', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference } = await bookedReservation(performanceId, ticketTypeId)

    const view = await signInAsBoxOffice(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      await waitFor(view, `document.querySelector('[data-test="desk-night"]')?.innerText.trim().length > 0`, 30_000)
      await waitFor(view, `document.querySelector('[data-test="desk-performance"]')`, 30_000)

      // No search typed and no button pressed: the auto-select of the night's first performance
      // has to trigger the search on its own (#940 criterion 1).
      await waitFor(view, `document.querySelector('[data-test="desk-results"]')?.innerText.includes(${JSON.stringify(reference)})`, 30_000)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// Choosing COMP left the reservation modal's own backdrop as an overlay that swallowed every
// further click; a URadioGroup replaces the nested select that caused it.
describe.skipIf(skip !== null)('raising a comp from the desk with real pointer events (#939)', () => {
  test('choosing COMP still lets the reason be typed and the request sent', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(900)
    const { reference, id } = await bookedReservation(performanceId, ticketTypeId)

    const view = await signInAsBoxOffice(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
      await waitFor(view, `document.querySelector('[data-test="desk-results"]')?.innerText.includes(${JSON.stringify(reference)})`, 30_000)

      await click(view, `[data-test="desk-open-${id}"]`)
      await waitFor(view, `document.querySelector('[data-test="desk-tender"]')`, 15_000)

      // Chosen by what the radio says rather than a value attribute, which is the group's own.
      await view.evaluate(`[...document.querySelectorAll('[data-test="desk-tender"] *')]
        .filter(node => node.textContent.trim() === 'Comp')
        .pop().click()`)
      await waitFor(view, `document.querySelector('[data-test="desk-comp-reason"]')`, 15_000)

      await fill(view, '[data-test="desk-comp-reason"]', 'Reviewer')
      await click(view, '[data-test="desk-request-comp"]')

      // The click has to reach the button rather than a leftover overlay: only a live request
      // proves it did, not the mere presence of the reason field.
      await waitFor(view, `document.querySelector('[data-test="desk-comp-pending"]')`, 15_000)

      const row = query<{ status: string }>(
        'SELECT status FROM ticket_comp_requests WHERE reservation_id = ?', id,
      )
      expect(row?.status).toBe('PENDING')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// No camera opens headlessly, which is criterion 8's own fallback: the screen says so, and the
// typed field takes the decoded value the way tests/e2e/door-camera-scan.test.ts feeds it.
describe.skipIf(skip !== null)('scanning with the camera, with no camera to open (criterion 8)', () => {
  test('the desk names the failure, then opens the collect modal for a decoded value typed in', async () => {
    const { performanceId, ticketTypeId } = await bookableShow()
    const { reference } = await bookedReservation(performanceId, ticketTypeId)

    const view = await signInAsBoxOffice(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
      await waitFor(view, `document.querySelector('[data-test="desk-performance"]')`, 30_000)

      await click(view, '[data-test="desk-scan-camera"]')
      await waitFor(view, `document.querySelector('[data-test="desk-scan-camera-note"]')`, 15_000)
      expect(await textOf(view, '[data-test="desk-scan-camera-note"]')).toContain('camera')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="qr-scanner"]'))`)).toBe(false)

      await fill(view, '[data-test="desk-scan"]', `${app.baseURL}/t/${reference}`)
      await click(view, '[data-test="desk-scan-submit"]')
      await waitFor(view, `document.querySelector('[data-test="desk-tender"]')`, 15_000)
      expect(await textOf(view, 'body')).toContain(`Reference ${reference}`)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// K-123: a refund is one press away from happening by accident, so it confirms first and the
// verb carries the amount going back. Back refunds nothing.
describe.skipIf(skip !== null)('refunding a ticket confirms before anything moves (K-123)', () => {
  test('Back refunds nothing, and the named verb refunds the ticket', async () => {
    expect((await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', { value: false }, officer.cookie)).status).toBe(200)
    try {
      const { performanceId, ticketTypeId } = await bookableShow(1250)
      const { reference, id } = await bookedReservation(performanceId, ticketTypeId)
      expect((await send('POST', `/api/box-office/desk/reservations/${id}/collect`, { expectedTotalPence: 1250, tender: 'CARD' })).status).toBe(200)

      const ticket = query<{ id: string }>('SELECT id FROM tickets WHERE reservation_id = ?', id)!
      const refunds = (): unknown[] => queryAll(
        'SELECT l.id FROM ledger_lines l WHERE l.kind = \'TICKET_REFUND\' AND l.ticket_id = ?', ticket.id,
      )

      const view = await signInAsBoxOffice(app.baseURL)
      try {
        await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
        await waitFor(view, `document.querySelector('[data-test="desk-results"]')?.innerText.includes(${JSON.stringify(reference)})`, 30_000)

        await click(view, `[data-test="desk-open-${id}"]`)
        await waitFor(view, `document.querySelector('[data-test="desk-refund-${ticket.id}"]')`, 15_000)

        // The press opens the confirmation rather than refunding, and the verb names the amount.
        await click(view, `[data-test="desk-refund-${ticket.id}"]`)
        await waitFor(view, `document.querySelector('[data-test="confirm-desk-refund-verb"]')`, 15_000)
        expect(await textOf(view, '[data-test="confirm-desk-refund-verb"]')).toContain('£12.50')

        await click(view, '[data-test="confirm-desk-refund-back"]')
        await waitFor(view, `!document.querySelector('[data-test="confirm-desk-refund-verb"]')`, 15_000)
        expect(refunds()).toEqual([])

        await click(view, `[data-test="desk-refund-${ticket.id}"]`)
        await waitFor(view, `document.querySelector('[data-test="confirm-desk-refund-verb"]')`, 15_000)
        await click(view, '[data-test="confirm-desk-refund-verb"]')
        await waitFor(view, `document.querySelector('[data-test="desk-nothing-owing"]')`, 30_000)

        const refund = query<{ amountPence: number }>(
          'SELECT amount_pence AS amountPence FROM ledger_lines WHERE kind = \'TICKET_REFUND\' AND ticket_id = ?', ticket.id,
        )
        expect(refund?.amountPence).toBe(-1250)
      }
      finally {
        view.close()
      }
    }
    finally {
      await send('PUT', '/api/admin/config/REFUND_PAID_REQUIRES_MANAGER', { value: true }, officer.cookie)
    }
  }, CASE_TIMEOUT_MS)
})

const twoHoursSeconds = 2 * 3_600

// D-115 criterion 7, issue 1151 item 9: the route and its schema were both there and the screen
// offered no way to reach them, so a walk-up could only be sold by the till.
describe.skipIf(skip !== null)('what a walk-up may be sold as at the desk (D-115 criterion 7)', () => {
  test('the desk reads the performance\'s own bookable types at the desk price', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(1100)

    const answered = await send('GET', `/api/box-office/desk/ticket-types?performanceId=${performanceId}`)
    expect(answered.status).toBe(200)

    const body = await answered.json() as { options: { id: string, name: string, price: number }[] }
    const option = body.options.find(each => each.id === ticketTypeId)
    expect(option?.price).toBe(1100)
  }, CASE_TIMEOUT_MS)

  test('a performance nobody has is a missing performance, not an empty list', async () => {
    expect((await send('GET', '/api/box-office/desk/ticket-types?performanceId=not-a-performance')).status).toBe(404)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('selling a walk-up from the desk screen (D-115 criterion 7)', () => {
  test('the total is read out, the sale lands as a door booking and the tiles move', async () => {
    const { performanceId, ticketTypeId } = await bookableShow(1100, twoHoursSeconds)

    const view = await signInAsBoxOffice(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
      await waitFor(view, `document.querySelector('[data-test="desk-walk-up"]')`, 30_000)

      // Nothing chosen: the sale names what it still needs rather than sitting dead.
      expect(await textOf(view, '[data-test="desk-walk-up-blocked"]')).toContain('ticket')

      await fill(view, `[data-test="desk-walk-up-quantity-${ticketTypeId}"]`, '2')
      await fill(view, '[data-test="desk-walk-up-name"]', 'Walk Up')
      await fill(view, '[data-test="desk-walk-up-email"]', registrableAddress('walkup'))
      await waitFor(view, `document.querySelector('[data-test="desk-walk-up-total"]')?.innerText.includes('£22.00')`, 15_000)

      await click(view, '[data-test="desk-walk-up-sell"]')
      await waitFor(view, `document.querySelector('[data-test="desk-summary-door"]')?.innerText.includes('2')`, 30_000)

      const sold = queryAll<{ source: string, status: string }>(
        'SELECT source, status FROM reservations WHERE performance_id = ?', performanceId,
      )
      expect(sold).toHaveLength(1)
      expect(sold[0]).toEqual({ source: 'DOOR', status: 'DOOR' })
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// D-114 criterion 9: the card searched on its own the moment a performance was chosen, then said
// "No results yet" about a search that had already run.
describe.skipIf(skip !== null)('an empty results card says which kind of empty it is (D-114 criterion 9)', () => {
  test('a house with no bookings reads differently from a search that matched nothing', async () => {
    await bookableShow(900, twoHoursSeconds)

    const view = await signInAsBoxOffice(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/box-office/desk`, '[data-test="desk-page"]')
      await waitFor(view, `document.querySelector('[data-test="desk-empty"]')`, 30_000)
      expect(await textOf(view, '[data-test="desk-empty"]')).toContain('No bookings on this performance')

      await fill(view, '[data-test="desk-search"]', 'Nobody At All')
      await click(view, '[data-test="desk-search-submit"]')
      await waitFor(view, `document.querySelector('[data-test="desk-empty"]')?.innerText.includes('No booking matches')`, 15_000)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
