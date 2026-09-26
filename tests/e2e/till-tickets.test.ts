import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { answerCharge, sellOnTheTill, startTypedCharge } from '#tests/helpers/till'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-122, F-123 and F-124 through the real routes: ticket money rides the bar's own ledger entry,
// the door then reads PAID, and a hand-off to the SumUp app posts nothing until it is answered.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
const barPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  // The dev server inherits this environment, so the hand-off is on for the suite unless an
  // earlier suite's server was adopted, which the SumUp cases below check for and skip.
  process.env.NUXT_SUMUP_AFFILIATE_KEY ??= 'test-affiliate-key'
  process.env.NUXT_SUMUP_APP_ID ??= 'uk.org.newtheatre.test'
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'tickets-bar', barPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
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

function programme(suffix: string): { venueId: string, performanceId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
    return { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

const openTill = (venueId: string): Promise<Response> => send('POST', '/api/till', { venueId }, barManager.cookie)

async function aSellableProduct(): Promise<{ variantId: string }> {
  const categoryId = await created(await send('POST', '/api/admin/bar/categories', { name: named('Soft') }))
  const productId = await created(await send('POST', '/api/admin/bar/products', { name: named('Lemonade'), categoryId }))
  const variantId = await created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' }))
  expect((await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 250, effectiveFrom: today() })).status).toBe(200)
  expect((await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })).status).toBe(200)
  return { variantId }
}

async function aTicketType(price = 900): Promise<string> {
  return created(await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price }))
}

async function pendingBooking(performanceId: string, ticketTypeId: string, quantity = 1): Promise<{ id: string, reference: string, totalPence: number }> {
  const answered = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity }],
    guest: { name: 'Till Tester', email: registrableAddress('till-guest') },
  }, '')
  expect(answered.status).toBe(200)
  const body = await answered.json() as { reference: string, totalPence: number }
  const row = query<{ id: string }>('SELECT id FROM reservations WHERE reference = ?', body.reference)!
  return { id: row.id, reference: body.reference, totalPence: body.totalPence }
}

const sale = (venueId: string, body: Record<string, unknown>, as = barManager.cookie): Promise<Response> =>
  sellOnTheTill(app, { venueId, lines: [], ...body }, as)

interface EntryRow { id: string, source: string, tender: string, total_pence: number }
interface LineRow { kind: string, amount_pence: number, reservation_id: string | null }

describe.skipIf(skip !== null)('a booking\'s money joins the basket and rides the bar\'s own entry (F-122)', () => {
  test('a pending booking is found by reference and by name, with what it owes', async () => {
    const { venueId, performanceId } = programme('tickets-find')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId, 2)
    await openTill(venueId)

    const byReference = await send('GET', `/api/till/bookings?venueId=${venueId}&q=${booking.reference}`, undefined, barManager.cookie)
    expect(byReference.status).toBe(200)
    const found = (await byReference.json() as { bookings: { reference: string, owedPence: number, partySize: number, refusal: string | null, isTonight: boolean }[] }).bookings
    expect(found).toHaveLength(1)
    expect(found[0]!.owedPence).toBe(1800)
    expect(found[0]!.partySize).toBe(2)
    expect(found[0]!.refusal).toBeNull()
    expect(found[0]!.isTonight).toBe(true)

    const byName = await send('GET', `/api/till/bookings?venueId=${venueId}&q=Till%20Tester`, undefined, barManager.cookie)
    expect((await byName.json() as { bookings: unknown[] }).bookings.length).toBeGreaterThanOrEqual(1)
  })

  test('a scanned /t/<ref> resolves to the booking, and a pass is refused with the door named', async () => {
    const { venueId, performanceId } = programme('tickets-scan')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)

    const scanned = await send('POST', '/api/till/bookings/scan', { venueId, scanned: `${app.baseURL}/t/${booking.reference}` }, barManager.cookie)
    expect(scanned.status).toBe(200)
    expect((await scanned.json() as { booking: { reference: string } }).booking.reference).toBe(booking.reference)

    const pass = await send('POST', '/api/till/bookings/scan', { venueId, scanned: `${app.baseURL}/passes/not-a-pass.sig` }, barManager.cookie)
    expect(pass.status).toBe(422)
    expect(await message(pass)).toContain('door')
  })

  test('drinks and a booking charge as one entry, the booking is collected, and it cannot be charged twice', async () => {
    const { venueId, performanceId } = programme('tickets-charge')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await sale(venueId, { lines: [{ variantId, qty: 2 }], tickets: [{ reservationId: booking.id }], expectedTotalPence: 500 + 900 })
    expect(answered.status).toBe(200)
    const receipt = await answered.json() as { entryId: string, totalPence: number, tickets: { reference: string }[] }
    expect(receipt.totalPence).toBe(1400)
    expect(receipt.tickets.map(ticket => ticket.reference)).toEqual([booking.reference])

    const entry = query<EntryRow>('SELECT id, source, tender, total_pence FROM ledger_entries WHERE id = ?', receipt.entryId)!
    expect(entry.source).toBe('TILL')
    expect(entry.tender).toBe('CARD')
    expect(entry.total_pence).toBe(1400)
    const lines = queryAll<LineRow>('SELECT kind, amount_pence, reservation_id FROM ledger_lines WHERE entry_id = ? ORDER BY kind', receipt.entryId)
    expect(lines.map(line => line.kind)).toEqual(['BAR_ITEM', 'TICKET_COLLECTION'])
    expect(lines.find(line => line.kind === 'TICKET_COLLECTION')!.reservation_id).toBe(booking.id)

    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booking.id)!.status).toBe('COLLECTED')

    const again = await sale(venueId, { tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 })
    expect(again.status).toBe(409)
    expect(await message(again)).toContain('already been collected')
  })

  test('a mismatched total is refused quoting both figures, and the booking stays pending', async () => {
    const { venueId, performanceId } = programme('tickets-mismatch')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)

    const answered = await sale(venueId, { tickets: [{ reservationId: booking.id }], expectedTotalPence: 800 })
    expect(answered.status).toBe(409)
    const said = await message(answered)
    expect(said).toContain('£8.00')
    expect(said).toContain('£9.00')
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booking.id)!.status).toBe('PENDING')
  })

  test('a tab refuses a basket holding a ticket line (criterion 5)', async () => {
    const { venueId, performanceId } = programme('tickets-tab')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)

    const answered = await sale(venueId, { tickets: [{ reservationId: booking.id }], expectedTotalPence: 900, tabHolderId: barManager.id })
    expect(answered.status).toBe(400)
  })
})

describe.skipIf(skip !== null)('a walk-up sold from the till (F-123)', () => {
  test('an anonymous walk-up is a DOOR reservation with no account, collected in the same request, with a door pass', async () => {
    const { venueId, performanceId } = programme('walk-up-anon')
    const ticketTypeId = await aTicketType(700)
    await openTill(venueId)

    const options = await send('GET', `/api/till/walk-up-options?venueId=${venueId}&performanceId=${performanceId}`, undefined, barManager.cookie)
    expect(options.status).toBe(200)
    expect((await options.json() as { options: { id: string, price: number }[] }).options.find(option => option.id === ticketTypeId)?.price).toBe(700)

    const answered = await sale(venueId, { walkUps: [{ performanceId, ticketTypeId, quantity: 2 }], expectedTotalPence: 1400 })
    expect(answered.status).toBe(200)
    const receipt = await answered.json() as { entryId: string, walkUps: { reservationId: string, reference: string, partySize: number, qrUrl: string, qrSvg: string }[] }
    expect(receipt.walkUps).toHaveLength(1)
    expect(receipt.walkUps[0]!.partySize).toBe(2)
    expect(receipt.walkUps[0]!.qrUrl).toContain('/qr/')
    expect(receipt.walkUps[0]!.qrSvg.length).toBeGreaterThan(0)

    const reservation = query<{ status: string, source: string, user_id: string | null }>('SELECT status, source, user_id FROM reservations WHERE id = ?', receipt.walkUps[0]!.reservationId)!
    expect(reservation.source).toBe('DOOR')
    expect(reservation.status).toBe('COLLECTED')
    expect(reservation.user_id).toBeNull()

    const lines = queryAll<LineRow>('SELECT kind, amount_pence, reservation_id FROM ledger_lines WHERE entry_id = ?', receipt.entryId)
    expect(lines.map(line => line.kind)).toEqual(['WALK_UP', 'WALK_UP'])
  })

  test('a walk-up with a name and an email gets an account and its confirmation', async () => {
    const { venueId, performanceId } = programme('walk-up-named')
    const ticketTypeId = await aTicketType(700)
    await openTill(venueId)
    const email = registrableAddress('walk-up')

    const answered = await sale(venueId, {
      walkUps: [{ performanceId, ticketTypeId, quantity: 1 }],
      walkUpGuest: { name: 'Walk Up', email },
      expectedTotalPence: 700,
    })
    expect(answered.status).toBe(200)
    const receipt = await answered.json() as { walkUps: { reservationId: string }[] }
    const user = query<{ id: string }>('SELECT id FROM users WHERE email = ?', email.toLowerCase())
    expect(user).toBeDefined()
    expect(query<{ user_id: string }>('SELECT user_id FROM reservations WHERE id = ?', receipt.walkUps[0]!.reservationId)!.user_id).toBe(user!.id)
    expect(query<{ n: number }>('SELECT count(*) AS n FROM notification_log WHERE user_id = ? AND type = ?', user!.id, 'reservation.walk-up-paid')!.n).toBe(1)
  })

  test('a walk-up for a performance not running tonight here is refused', async () => {
    const { venueId } = programme('walk-up-tonight')
    const elsewhere = programme('walk-up-elsewhere')
    const ticketTypeId = await aTicketType()
    await openTill(venueId)

    const answered = await sale(venueId, { walkUps: [{ performanceId: elsewhere.performanceId, ticketTypeId, quantity: 1 }], expectedTotalPence: 900 })
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('tonight')
  })
})

interface AttemptAnswer { id: string, launchUrl: string, totalPence: number }

async function sumupOn(venueId: string): Promise<boolean> {
  const status = await send('GET', `/api/till?venueId=${venueId}`, undefined, barManager.cookie)
  return (await status.json() as { sumupEnabled: boolean }).sumupEnabled
}

describe.skipIf(skip !== null)('the hand-off to the SumUp app (F-124)', () => {
  test('with the keys unset the route says so and the typed figure is the flow; with them set an attempt is started and nothing posts', async () => {
    const { venueId, performanceId } = programme('sumup-start')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)

    const before = query<{ n: number }>('SELECT count(*) AS n FROM ledger_entries')!.n
    const started = await send('POST', '/api/till/payments', { venueId, lines: [], tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 }, barManager.cookie)

    if (!await sumupOn(venueId)) {
      expect(started.status).toBe(409)
      expect(await message(started)).toContain('reader')
      return
    }

    expect(started.status).toBe(200)
    const answer = await started.json() as AttemptAnswer
    expect(answer.launchUrl.startsWith('sumupmerchant://pay/1.0?')).toBe(true)
    expect(answer.launchUrl).toContain(`foreign-tx-id=${answer.id}`)
    expect(query<{ n: number }>('SELECT count(*) AS n FROM ledger_entries')!.n).toBe(before)
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booking.id)!.status).toBe('PENDING')

    // The booking inside the attempt cannot be charged again by hand (criterion 7).
    const byHand = await sale(venueId, { tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 })
    expect(byHand.status).toBe(409)
    expect(await message(byHand)).toContain('waiting for its answer')

    // The keyed return posts the sale with no session at all (criterion 3), and once only.
    const key = new URL(answer.launchUrl.replace('sumupmerchant://', 'https://')).searchParams.get('callback')!.split('/pay/return/')[1]!
    const completed = await send('POST', `/api/till/payments/${answer.id}/complete`, { key, smpStatus: 'success', smpTxCode: 'TX123', foreignTxId: answer.id }, '')
    expect(completed.status).toBe(200)
    // The venue rides the answer, so the return page's way back opens this bar (issue 1257).
    expect(await completed.json() as { status: string, venueId: string }).toMatchObject({ status: 'SUCCEEDED', venueId })
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booking.id)!.status).toBe('COLLECTED')
    expect(query<{ n: number }>('SELECT count(*) AS n FROM ledger_entries')!.n).toBe(before + 1)
    expect(query<{ code: string }>('SELECT smp_tx_code AS code FROM sumup_attempts WHERE id = ?', answer.id)!.code).toBe('TX123')

    const again = await send('POST', `/api/till/payments/${answer.id}/complete`, { key, smpStatus: 'success', smpTxCode: 'TX123' }, '')
    expect(again.status).toBe(200)
    expect((await again.json() as { status: string }).status).toBe('SUCCEEDED')
    expect(query<{ n: number }>('SELECT count(*) AS n FROM ledger_entries')!.n).toBe(before + 1)

    const forged = await send('POST', `/api/till/payments/${answer.id}/complete`, { key: `${answer.id}.forged`, smpStatus: 'success' }, '')
    expect(forged.status).toBe(401)
  })

  // The stuck clock runs from the answer, not from the hand-off (criterion 5). A basket keyed in
  // at seven o'clock and answered at nine is not stuck the moment the answer lands.
  test('a completion answered a moment ago survives the sweep, however old the hand-off', async () => {
    const { venueId, performanceId } = programme('sumup-stuck-clock')
    if (!await sumupOn(venueId)) return
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)

    const started = await (await send('POST', '/api/till/payments', { venueId, lines: [], tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 }, barManager.cookie)).json() as AttemptAnswer

    const now = Math.floor(Date.now() / 1000)
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE sumup_attempts SET status = ?, created_at = ?, callback_at = ? WHERE id = ?')
        .run('COMPLETING', now - 3 * 60 * 60, now, started.id)
    }
    finally {
      database.close()
    }

    const swept = await fetch(`${app.baseURL}/_nitro/tasks/payments:sweep`, { method: 'POST' })
    expect(swept.status).toBe(200)

    expect(query<{ status: string }>('SELECT status FROM sumup_attempts WHERE id = ?', started.id)!.status).toBe('COMPLETING')
  })

  test('a failure restores nothing but the basket; a booking collected meanwhile makes a mismatch; the close waits for an open attempt', async () => {
    const { venueId, performanceId } = programme('sumup-outcomes')
    if (!await sumupOn(venueId)) return
    const ticketTypeId = await aTicketType()
    const failing = await pendingBooking(performanceId, ticketTypeId)
    const contested = await pendingBooking(performanceId, ticketTypeId)
    const session = await openTill(venueId)
    const sessionId = (await session.json() as { session: { id: string } }).session.id

    const failed = await (await send('POST', '/api/till/payments', { venueId, lines: [], tickets: [{ reservationId: failing.id }], expectedTotalPence: 900 }, barManager.cookie)).json() as AttemptAnswer
    const answeredFailed = await send('POST', `/api/till/payments/${failed.id}/complete`, { smpStatus: 'failed', smpFailureCause: 'transaction-failed' }, barManager.cookie)
    expect(await answeredFailed.json() as { status: string, venueId: string }).toMatchObject({ status: 'FAILED', venueId })
    expect(query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', failing.id)!.status).toBe('PENDING')

    const started = await (await send('POST', '/api/till/payments', { venueId, lines: [], tickets: [{ reservationId: contested.id }], expectedTotalPence: 900 }, barManager.cookie)).json() as AttemptAnswer
    // A hand-off is answered Payment did not, never Card declined (0096).
    expect((await answerCharge(app, started.id, 'declined', barManager.cookie)).status).toBe(409)
    const closeRefused = await send('POST', '/api/till/close', { id: sessionId, actualZPence: 0 }, barManager.cookie)
    expect(closeRefused.status).toBe(409)
    expect(await message(closeRefused)).toContain('waiting for an answer')

    // The desk collects it while the phone is in the SumUp app.
    expect((await send('POST', `/api/box-office/desk/reservations/${contested.id}/collect`, { expectedTotalPence: 900, tender: 'CARD' })).status).toBe(200)
    const mismatched = await send('POST', `/api/till/payments/${started.id}/complete`, { smpStatus: 'success', smpTxCode: 'TX999' }, barManager.cookie)
    expect((await mismatched.json() as { status: string, error: string | null }).status).toBe('MISMATCH')

    const abandonedWithoutNote = await send('POST', `/api/till/payments/${started.id}/resolve`, { outcome: 'abandoned' }, barManager.cookie)
    expect(abandonedWithoutNote.status).toBe(400)
    const abandoned = await send('POST', `/api/till/payments/${started.id}/resolve`, { outcome: 'abandoned', note: 'refunded on the reader' }, barManager.cookie)
    expect((await abandoned.json() as { status: string }).status).toBe('ABANDONED')

    // The one reader's Z is the whole night's, desk collection included (issue 1308).
    const preview = await (await send('GET', `/api/till/${sessionId}/reconciliation`, undefined, barManager.cookie)).json() as { wholeNightExpectedPence: number }
    const closed = await send('POST', '/api/till/close', { id: sessionId, actualZPence: preview.wholeNightExpectedPence }, barManager.cookie)
    expect(closed.status).toBe(200)
  })
})

// Decision 0096: a declined card at the bar never leaves a PAID booking behind it.
describe.skipIf(skip !== null)('a booking in a typed charge is collected only once the reader has answered (0096)', () => {
  test('Card declined leaves the booking unpaid and chargeable again; Reader took it collects it', async () => {
    const { venueId, performanceId } = programme('typed-booking')
    const ticketTypeId = await aTicketType()
    const booking = await pendingBooking(performanceId, ticketTypeId)
    await openTill(venueId)
    const basket = { venueId, lines: [], tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 }
    const bookingStatus = (): string => query<{ status: string }>('SELECT status FROM reservations WHERE id = ?', booking.id)!.status
    const entries = (): number => query<{ n: number }>('SELECT count(*) AS n FROM ledger_entries')!.n

    const before = entries()
    const first = await (await startTypedCharge(app, basket, barManager.cookie)).json() as { id: string }
    expect(bookingStatus()).toBe('PENDING')

    // Held by the open attempt, so a second charge of it waits for the first (F-124 criterion 7).
    expect((await startTypedCharge(app, basket, barManager.cookie)).status).toBe(409)

    expect((await answerCharge(app, first.id, 'declined', barManager.cookie)).status).toBe(200)
    expect(bookingStatus()).toBe('PENDING')
    expect(entries()).toBe(before)

    const retried = await sale(venueId, { tickets: [{ reservationId: booking.id }], expectedTotalPence: 900 })
    expect(retried.status).toBe(200)
    expect(bookingStatus()).toBe('COLLECTED')
    expect(entries()).toBe(before + 1)
  })
})
