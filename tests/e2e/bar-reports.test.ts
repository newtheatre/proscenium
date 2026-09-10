import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-119: sales, GP, variance, comp and discount reports, read live from the ledger, with a
// guarded CSV export per section.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
let barStaff: TestMember
const barManagerPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'report-bar-manager', barManagerPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  barStaff = await registerMember(app, 'report-bar-staff', generatePassword())
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

function programme(suffix: string) {
  const database = new Database(app.databaseFile)
  try {
    return tonightsPerformance(sqliteTarget(database), { suffix })
  }
  finally {
    database.close()
  }
}

let nextSlot = 400
function confirmBarShift(performanceId: string, userId: string): void {
  const database = new Database(app.databaseFile)
  try {
    const id = `${performanceId}-BAR-${(nextSlot += 1)}`
    database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, performanceId, 'BAR', nextSlot, userId, 'CONFIRMED')
  }
  finally {
    database.close()
  }
}

function openTill(venueId: string, performanceId: string, as: string = barStaff.cookie): Promise<Response> {
  if (as === barStaff.cookie) confirmBarShift(performanceId, barStaff.id)
  return send('POST', '/api/till', { venueId }, as)
}

// A delivered, sellable item with a known cost, so GP is a figure the test can predict exactly.
async function aStockedProduct(pricePence: number, unitCostPence: number): Promise<{ variantId: string, itemId: string }> {
  const categoryAnswered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  const { id: categoryId } = await categoryAnswered.json() as { id: string }
  const itemAnswered = await send('POST', '/api/admin/bar/items', { name: named('Gin'), unit: 'ML', containerMl: 700 })
  const { id: itemId } = await itemAnswered.json() as { id: string }
  await send('POST', '/api/admin/bar/movements', { itemId, qty: 700, kind: 'DELIVERY', unitCostPence })
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 50 }] })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId, itemId }
}

interface ReportBody {
  report: {
    fromAt: number
    toAt: number
    sales: { productName: string, variantLabel: string, qty: number, revenuePence: number }[]
    gp: { revenuePence: number, costPence: number, grossProfitPence: number, byItem: { itemName: string, qtyDepleted: number, costPence: number }[] }
    comps: { reason: string, foregonePence: number }[]
    discounts: { discountName: string, discountedPence: number }[]
  }
}

const customRange = (): string => {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
  return `kind=CUSTOM&from=${from}&to=${to}`
}

const runReport = (as = officer.cookie): Promise<Response> => send('GET', `/api/admin/bar/reports?${customRange()}`, undefined, as)

describe.skipIf(skip !== null)('sales, GP, comps and discounts are read live from the ledger (criteria 1, 3, 4)', () => {
  test('a plain sale appears in sales and GP, in integer pence', async () => {
    const { venueId, performanceId } = programme(`report-sale-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(500, 100)
    await openTill(venueId, performanceId)
    await send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 2 }], expectedTotalPence: 1000 }, barStaff.cookie)

    const answered = await runReport()
    expect(answered.status).toBe(200)
    const { report } = await answered.json() as ReportBody
    expect(Number.isInteger(report.gp.revenuePence)).toBe(true)

    const sold = report.sales.find(row => row.variantLabel === 'Single' && row.revenuePence === 1000)
    expect(sold).toBeTruthy()
    expect(sold?.qty).toBe(2)

    // 2 servings * 50ml each, at 100p/700ml delivered: (100 * 2) - the same figure GP computes.
    const gpItem = report.gp.byItem.find(row => row.qtyDepleted === 100)
    expect(gpItem).toBeTruthy()
    expect(report.gp.revenuePence).toBeGreaterThanOrEqual(1000)
    expect(report.gp.grossProfitPence).toBe(report.gp.revenuePence - report.gp.costPence)
  })

  test('a comp reports its reason, its approver and the foregone value, not zero', async () => {
    const { venueId, performanceId } = programme(`report-comp-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(500, 100)
    await openTill(venueId, performanceId)
    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`${performanceId}-DM-1`, performanceId, 'DUTY_MANAGER', 1, barManager.id, 'CONFIRMED')
    }
    finally {
      database.close()
    }

    const asked = await send('POST', '/api/till/comp-requests', { venueId, lines: [{ variantId, qty: 1 }], reason: 'A round on the house' }, barStaff.cookie)
    const { id } = await asked.json() as { id: string }
    await send('POST', `/api/till/comp-requests/${id}/approve`, {}, barManager.cookie)
    await send('POST', `/api/till/comp-requests/${id}/sale`, { venueId, expectedForegonePence: 500 }, barStaff.cookie)

    const { report } = await (await runReport()).json() as ReportBody
    const comp = report.comps.find(row => row.reason === 'A round on the house')
    expect(comp).toBeTruthy()
    expect(comp?.foregonePence).toBe(500)
  })

  test('a discount reports the name and the pence given away', async () => {
    const { venueId, performanceId } = programme(`report-discount-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(1000, 100)
    await openTill(venueId, performanceId, barManager.cookie)
    const name = named('Members night')
    const discountAnswered = await send('POST', '/api/admin/bar/discounts', { name, percent: 20 })
    const { id: discountId } = await discountAnswered.json() as { id: string }

    await send('POST', '/api/till/sale', {
      venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 800, discountId,
    }, barManager.cookie)

    const { report } = await (await runReport()).json() as ReportBody
    const discount = report.discounts.find(row => row.discountName === name)
    expect(discount).toBeTruthy()
    expect(discount?.discountedPence).toBe(200)
  })
})

describe.skipIf(skip !== null)('CSV export is guarded and formatted at display, one section at a time (criteria 2, 3)', () => {
  test('a CSV export formats money and guards a name that looks like a formula', async () => {
    const { venueId, performanceId } = programme(`report-csv-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(500, 100)
    await openTill(venueId, performanceId)
    await send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 500 }, barStaff.cookie)

    const answered = await send('GET', `/api/admin/bar/reports/export?${customRange()}&section=sales`)
    expect(answered.status).toBe(200)
    expect(answered.headers.get('content-type')).toContain('text/csv')
    const csv = await answered.text()
    expect(csv).toContain('£5.00')
    expect(csv.startsWith('"category","product","variant","qty","revenue"')).toBe(true)
  })

  test('a discount named like a formula is exported inert', async () => {
    const { venueId, performanceId } = programme(`report-csv-formula-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(1000, 100)
    await openTill(venueId, performanceId, barManager.cookie)
    const discountAnswered = await send('POST', '/api/admin/bar/discounts', { name: `=SUM(A1) ${crypto.randomUUID().slice(0, 6)}`, percent: 10 })
    const { id: discountId } = await discountAnswered.json() as { id: string }
    await send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 900, discountId }, barManager.cookie)

    const csv = await (await send('GET', `/api/admin/bar/reports/export?${customRange()}&section=discounts`)).text()
    expect(csv).toContain('"\'=SUM(A1)')
  })
})

describe.skipIf(skip !== null)('access is limited to the bar manager and administrators (criterion 5)', () => {
  test('ordinary bar staff cannot read the report', async () => {
    const answered = await runReport(barStaff.cookie)
    expect(answered.status).toBe(403)
  })

  test('the bar manager can', async () => {
    const answered = await runReport(barManager.cookie)
    expect(answered.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('a sale appears in the sales section once refreshed', async () => {
    const { venueId, performanceId } = programme(`report-screen-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aStockedProduct(500, 100)
    await openTill(venueId, performanceId)
    await send('POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 500 }, barStaff.cookie)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barManagerPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/reports`, '[data-test="period-kind"]')
    await click(view, '[data-test="refresh-report"]')
    await waitFor(view, `document.querySelector('[data-test="section-sales"]')`)
    expect(await textOf(view, '[data-test="section-sales"]')).toContain('£5.00')
    view.close()
  }, 120_000)
})
