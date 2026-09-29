import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, grantRole, registerMember } from '#tests/helpers/accounts'
import { saysMoney } from '#shared/utils/bar'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword, registrableAddress } from '#tests/helpers/seed'
import { sellOnTheTill } from '#tests/helpers/till'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import { putOnTheTill } from '#tests/helpers/bar'
import type { TestMember } from '#tests/helpers/accounts'
import { Database } from 'bun:sqlite'
import { currentShowNight, showNightBounds } from '#shared/utils/show-night'

// F-118: reconciliation to the expected SumUp Z figure, at preview and at close, and the same
// figure the night report's bar summary carries (criterion 4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let bar: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  bar = await registerMember(app, 'reconcile-bar', generatePassword())
  await grantRole(app, bar, 'BAR_MANAGER', officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = bar.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

function programme(suffix: string) {
  const database = new Database(app.databaseFile)
  try {
    return tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
  }
  finally {
    database.close()
  }
}

function confirmBarShift(performanceId: string, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`${performanceId}-BAR`, performanceId, 'BAR', 1, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

async function aSellableProduct(pricePence: number): Promise<{ variantId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }, officer.cookie)
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId }, officer.cookie)
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' }, officer.cookie)
  const { id: variantId } = await variantAnswered.json() as { id: string }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today }, officer.cookie)
  await putOnTheTill((method, path, body) => send(method, path, body, officer.cookie), productId)
  return { variantId }
}

function openTill(venueId: string, performanceId: string): Promise<Response> {
  confirmBarShift(performanceId, bar.id)
  return send('POST', '/api/till', { venueId })
}

const sell = (venueId: string, variantId: string, pricePence: number): Promise<Response> =>
  sellOnTheTill(app, { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence }, bar.cookie)

interface Reconciliation {
  bar: { cardSalesPence: number, tabSettlementsPence: number, expectedPence: number }
  deskTakingsPence: number
  wholeNightExpectedPence: number
}

const preview = (id: string): Promise<Response> => send('GET', `/api/till/${id}/reconciliation`)

const close = (id: string, actualZPence: number, varianceNote?: string): Promise<Response> =>
  send('POST', '/api/till/close', { id, actualZPence, varianceNote })

interface ClosedSession { expectedTotalPence: number, actualZPence: number, variancePence: number, varianceNote: string | null }

// Every test here sells on the same show night, so what the one reader should show is read off
// the preview rather than assumed from this test's own sales (issue 1308).
async function wholeNight(id: string): Promise<Reconciliation> {
  const seen = await preview(id)
  expect(seen.status).toBe(200)
  return await seen.json() as Reconciliation
}

async function aDeskCollection(performanceId: string, pricePence: number): Promise<void> {
  const typeAnswered = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: pricePence }, officer.cookie)
  const { id: ticketTypeId } = await typeAnswered.json() as { id: string }
  const booked = await send('POST', '/api/reservations', {
    performanceId,
    lines: [{ ticketTypeId, quantity: 1 }],
    guest: { name: 'Desk Tester', email: registrableAddress('reconcile-desk') },
  }, '')
  expect(booked.status).toBe(200)
  const { reference } = await booked.json() as { reference: string }
  const database = new Database(app.databaseFile, { readonly: true })
  let reservationId: string
  try {
    reservationId = (database.query('SELECT id FROM reservations WHERE reference = ?').get(reference) as { id: string }).id
  }
  finally {
    database.close()
  }
  const collected = await send('POST', `/api/box-office/desk/reservations/${reservationId}/collect`, { expectedTotalPence: pricePence, tender: 'CARD' }, officer.cookie)
  expect(collected.status).toBe(200)
}

describe.skipIf(skip !== null)('the preview matches a real sale before anyone closes (criterion 1)', () => {
  test('a card sale is the whole of the expected figure', async () => {
    const { venueId, performanceId } = programme(`reconcile-preview-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(650)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 650)

    const seen = await preview(opened.session.id)
    expect(seen.status).toBe(200)
    const body = await seen.json() as Reconciliation
    expect(body.bar).toMatchObject({ cardSalesPence: 650, tabSettlementsPence: 0, expectedPence: 650 })
  })
})

describe.skipIf(skip !== null)('closing records the reader against the ledger (criterion 3)', () => {
  test('the reader agreeing with the whole night needs no note', async () => {
    const { venueId, performanceId } = programme(`reconcile-agree-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(400)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 400)
    const expected = (await wholeNight(opened.session.id)).wholeNightExpectedPence

    const closed = await close(opened.session.id, expected)
    expect(closed.status).toBe(200)
    const body = await closed.json() as { session: ClosedSession }
    expect(body.session).toMatchObject({ expectedTotalPence: expected, actualZPence: expected, variancePence: 0, varianceNote: null })
  })

  test('a disagreeing reading with no note is refused, naming both figures', async () => {
    const { venueId, performanceId } = programme(`reconcile-variance-refused-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 500)
    const expected = (await wholeNight(opened.session.id)).wholeNightExpectedPence

    const refused = await close(opened.session.id, expected - 200)
    expect(refused.status).toBe(400)
    const said = await message(refused)
    expect(said).toContain(saysMoney(expected - 200))
    expect(said).toContain(`should show ${saysMoney(expected)}`)
  })

  test('a disagreeing reading with a note is recorded, append-only, with the note', async () => {
    const { venueId, performanceId } = programme(`reconcile-variance-noted-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 500)
    const expected = (await wholeNight(opened.session.id)).wholeNightExpectedPence

    const closed = await close(opened.session.id, expected - 50, 'Reader was short a card that failed to authorise')
    expect(closed.status).toBe(200)
    const body = await closed.json() as { session: ClosedSession }
    expect(body.session).toMatchObject({
      expectedTotalPence: expected, actualZPence: expected - 50, variancePence: -50, varianceNote: 'Reader was short a card that failed to authorise',
    })
  })
})

// One reader and one login serve the desk and the bar on a show night (IT Manager, 26 September
// 2026), so the Z the close takes is the whole night's (issue 1308, F-118 criterion 1).
describe.skipIf(skip !== null)('the close compares the reader with the whole night, the desk included (criterion 1)', () => {
  test('the correct whole-night Z closes with no note; the bar\'s share alone is refused', async () => {
    const { venueId, performanceId } = programme(`reconcile-whole-night-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(1890)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 1890)
    await aDeskCollection(performanceId, 2800)

    const night = await wholeNight(opened.session.id)
    expect(night.deskTakingsPence).toBeGreaterThanOrEqual(2800)
    expect(night.wholeNightExpectedPence).toBeGreaterThanOrEqual(1890 + 2800)

    const barAlone = await close(opened.session.id, night.wholeNightExpectedPence - night.deskTakingsPence)
    expect(barAlone.status).toBe(400)
    expect(await message(barAlone)).toContain('box office')

    const closed = await close(opened.session.id, night.wholeNightExpectedPence)
    expect(closed.status).toBe(200)
    const body = await closed.json() as { session: ClosedSession }
    expect(body.session).toMatchObject({ expectedTotalPence: night.wholeNightExpectedPence, variancePence: 0, varianceNote: null })
  })
})

// Card sales on every till the session's night, as the ledger holds them (F-118 criterion 1).
function nightCardSales(sessionId: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const { night } = database.query('SELECT night FROM till_sessions WHERE id = ?').get(sessionId) as { night: string }
    const { from, to } = showNightBounds(night)
    return (database.query(`
      SELECT coalesce(sum(l.amount_pence), 0) AS pence
      FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
      WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind = 'BAR_ITEM' AND e.happened_at >= ? AND e.happened_at < ?
    `).get(Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)) as { pence: number }).pence
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the night report carries the same figure, never a retyped one (criterion 4)', () => {
  // The till-close figure is the night's, quoted on the report as the night's (#1572).
  test('the report\'s night card figure equals the reconciliation\'s own card sales', async () => {
    const { venueId, performanceId } = programme(`reconcile-report-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(725)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 725)

    const seen = await preview(opened.session.id)
    const reconciliation = await seen.json() as Reconciliation

    const reported = await send('GET', `/api/tonight/report?performanceId=${performanceId}`, undefined, officer.cookie)
    expect(reported.status).toBe(200)
    const report = await reported.json() as { bar: { revenuePence: number, itemsSold: number, nightCardSalesPence: number } }
    // The preview is this till's; the report quotes the whole night's, every bar tonight, as the
    // close's own Z does (0097). So it is this till's sale and every other bar's card sales too.
    expect(reconciliation.bar.cardSalesPence).toBe(725)
    expect(report.bar.nightCardSalesPence).toBe(nightCardSales(opened.session.id))
    expect(report.bar.nightCardSalesPence).toBeGreaterThanOrEqual(725)
    expect(report.bar.itemsSold).toBe(1)
  })
})

// Decision 0097, issue 1309: the close records the night's reader total, so the Treasurer resolves
// a difference rather than retyping the Z. Last in the file: it leaves a Treasurer's reading on tonight.
describe.skipIf(skip !== null)('the close records the night\'s reading for the Treasurer (I-104 criterion 2)', () => {
  interface Current { id: string, readerPence: number, expectedPence: number, variancePence: number, note: string | null, enteredBy: string }

  async function current(): Promise<Current | null> {
    const read = await send('GET', `/api/admin/finance/reconciliation?night=${currentShowNight()}`, undefined, officer.cookie)
    expect(read.status).toBe(200)
    return (await read.json() as { current: Current | null }).current
  }

  test('the closer\'s Z and note are the night\'s current reading, and a reading the Treasurer records stands', async () => {
    const { venueId, performanceId } = programme(`reconcile-reading-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(700)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 700)
    const expected = (await wholeNight(opened.session.id)).wholeNightExpectedPence

    expect((await close(opened.session.id, expected + 20, 'A tip keyed as a sale')).status).toBe(200)
    const recorded = await current()
    expect(recorded).toMatchObject({ readerPence: expected + 20, expectedPence: expected, variancePence: 20, note: 'A tip keyed as a sale', enteredBy: bar.id })

    const corrected = await send('POST', '/api/admin/finance/reconciliation', {
      night: currentShowNight(), readerPence: expected, note: 'The tip was taken off the reader', supersedesId: recorded!.id, writtenOff: false,
    }, officer.cookie)
    expect(corrected.status).toBe(200)
    const { id: correctionId } = await corrected.json() as { id: string }

    const later = programme(`reconcile-reading-later-${crypto.randomUUID().slice(0, 6)}`)
    const laterOpened = await (await openTill(later.venueId, later.performanceId)).json() as { session: { id: string } }
    const laterExpected = (await wholeNight(laterOpened.session.id)).wholeNightExpectedPence
    expect((await close(laterOpened.session.id, laterExpected)).status).toBe(200)
    expect((await current())?.id).toBe(correctionId)
  })
})
