import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'
import { Database } from 'bun:sqlite'

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
  await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, officer.cookie)
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
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' }, officer.cookie)
  return { variantId }
}

function openTill(venueId: string, performanceId: string): Promise<Response> {
  confirmBarShift(performanceId, bar.id)
  return send('POST', '/api/till', { venueId })
}

const sell = (venueId: string, variantId: string, pricePence: number): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: pricePence })

interface Reconciliation {
  bar: { cardSalesPence: number, tabSettlementsPence: number, expectedPence: number }
  deskTakingsPence: number
  wholeNightExpectedPence: number
}

const preview = (id: string): Promise<Response> => send('GET', `/api/till/${id}/reconciliation`)

const close = (id: string, actualZPence: number, varianceNote?: string): Promise<Response> =>
  send('POST', '/api/till/close', { id, actualZPence, varianceNote })

interface ClosedSession { expectedTotalPence: number, actualZPence: number, variancePence: number, varianceNote: string | null }

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
  test('the reader agreeing with the ledger needs no note', async () => {
    const { venueId, performanceId } = programme(`reconcile-agree-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(400)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 400)

    const closed = await close(opened.session.id, 400)
    expect(closed.status).toBe(200)
    const body = await closed.json() as { session: ClosedSession }
    expect(body.session).toMatchObject({ expectedTotalPence: 400, actualZPence: 400, variancePence: 0, varianceNote: null })
  })

  test('a disagreeing reading with no note is refused, naming both figures', async () => {
    const { venueId, performanceId } = programme(`reconcile-variance-refused-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 500)

    const refused = await close(opened.session.id, 300)
    expect(refused.status).toBe(400)
    const said = await message(refused)
    expect(said).toContain('£3.00')
    expect(said).toContain('£5.00')
  })

  test('a disagreeing reading with a note is recorded, append-only, with the note', async () => {
    const { venueId, performanceId } = programme(`reconcile-variance-noted-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(500)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 500)

    const closed = await close(opened.session.id, 450, 'Reader was short a card that failed to authorise')
    expect(closed.status).toBe(200)
    const body = await closed.json() as { session: ClosedSession }
    expect(body.session).toMatchObject({
      expectedTotalPence: 500, actualZPence: 450, variancePence: -50, varianceNote: 'Reader was short a card that failed to authorise',
    })
  })
})

describe.skipIf(skip !== null)('the night report carries the same figure, never a retyped one (criterion 4)', () => {
  test('the report\'s bar revenue equals the reconciliation\'s own card sales', async () => {
    const { venueId, performanceId } = programme(`reconcile-report-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct(725)
    const opened = await (await openTill(venueId, performanceId)).json() as { session: { id: string } }
    await sell(venueId, variantId, 725)

    const seen = await preview(opened.session.id)
    const reconciliation = await seen.json() as Reconciliation

    const reported = await send('GET', `/api/tonight/report?performanceId=${performanceId}`, undefined, officer.cookie)
    expect(reported.status).toBe(200)
    const report = await reported.json() as { bar: { revenuePence: number, itemsSold: number } }
    expect(report.bar.revenuePence).toBe(reconciliation.bar.cardSalesPence)
    expect(report.bar.itemsSold).toBe(1)
  })
})
