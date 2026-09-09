import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-117: a discount is a capped percentage, editable in place, snapshotted onto every ledger
// line it touches so a later edit never restates what a past sale actually charged.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
let member: TestMember
const barPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'discount-bar', barPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)
  member = await registerMember(app, 'discount-ordinary', generatePassword())
  await setCap(20)
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

async function message(response: Response): Promise<string> {
  const body = await response.json() as { statusMessage?: string, message?: string }
  return body.statusMessage ?? body.message ?? ''
}

const setCap = (percent: number): Promise<Response> =>
  send('PUT', '/api/admin/config/BAR_DISCOUNT_MAX_PERCENT', { value: percent })

const createDiscount = (name: string, percent: number, as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/admin/bar/discounts', { name, percent }, as)

async function aDiscount(percent = 10): Promise<{ id: string, name: string }> {
  const name = named('Members night')
  const answered = await createDiscount(name, percent)
  expect(answered.status).toBe(200)
  const { id } = await answered.json() as { id: string }
  return { id, name }
}

function programme(suffix: string): { venueId: string } {
  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix })
    return { venueId: made.venueId }
  }
  finally {
    database.close()
  }
}

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
const openTill = (venueId: string): Promise<Response> => send('POST', '/api/till', { venueId }, barManager.cookie)
const aCategory = async (): Promise<string> => {
  const answered = await send('POST', '/api/admin/bar/categories', { name: named('Spirits') })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function aSellableProduct(): Promise<{ variantId: string }> {
  const categoryId = await aCategory()
  const productAnswered = await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId })
  const { id: productId } = await productAnswered.json() as { id: string }
  const variantAnswered = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single' })
  const { id: variantId } = await variantAnswered.json() as { id: string }
  await send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 500, effectiveFrom: today() })
  await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
  return { variantId }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, discountId: string | null, as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines, expectedTotalPence, discountId }, as)

interface LedgerLineRow { amount_pence: number, discount_id: string | null, discount_percent: number | null, discount_pence: number | null }

function latestLedgerLine(): LedgerLineRow | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT * FROM ledger_lines ORDER BY rowid DESC LIMIT 1').get() as LedgerLineRow | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a discount is a percentage above zero, capped by configuration (criterion 1)', () => {
  test('a discount at or under the cap is created', async () => {
    expect((await createDiscount(named('Under cap'), 20)).status).toBe(200)
    expect((await createDiscount(named('At cap'), 20)).status).toBe(200)
  })

  test('a discount over the cap is refused, naming the cap', async () => {
    const answered = await createDiscount(named('Over cap'), 21)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('20%')
  })

  test('editing above the cap is refused the same way', async () => {
    const { id } = await aDiscount(10)
    const answered = await send('PUT', `/api/admin/bar/discounts/${id}`, { name: named('Edited'), percent: 25 })
    expect(answered.status).toBe(409)
  })

  test('two discounts cannot share a name', async () => {
    const { name } = await aDiscount()
    const answered = await createDiscount(name, 10)
    expect(answered.status).toBe(409)
  })

  test('creation is refused outright when no cap has ever been set', async () => {
    const database = new Database(app.databaseFile)
    try {
      database.run(`DELETE FROM config WHERE key = 'BAR_DISCOUNT_MAX_PERCENT'`)
    }
    finally {
      database.close()
    }
    const answered = await createDiscount(named('No cap yet'), 5)
    expect(answered.status).toBe(503)
    await setCap(20)
  })
})

describe.skipIf(skip !== null)('creation and edits are bar-manager-only and audited (criterion 5)', () => {
  test('an ordinary member may not create or edit a discount', async () => {
    expect((await createDiscount(named('Blocked'), 10, member.cookie)).status).toBe(403)
    const { id } = await aDiscount()
    expect((await send('PUT', `/api/admin/bar/discounts/${id}`, { name: named('Blocked edit'), percent: 5 }, member.cookie)).status).toBe(403)
  })

  test('a created discount is audited', async () => {
    const database = new Database(app.databaseFile, { readonly: true })
    try {
      const before = (database.query(`SELECT count(*) AS n FROM audit_log WHERE action = 'bar.discount.created'`).get() as { n: number }).n
      await aDiscount()
      const after = (database.query(`SELECT count(*) AS n FROM audit_log WHERE action = 'bar.discount.created'`).get() as { n: number }).n
      expect(after).toBe(before + 1)
    }
    finally {
      database.close()
    }
  })
})

describe.skipIf(skip !== null)('a discount is retired, never deleted', () => {
  test('a retired discount cannot be applied to a new sale', async () => {
    const { id } = await aDiscount()
    expect((await send('POST', `/api/admin/bar/discounts/${id}/status`, { status: 'RETIRED' })).status).toBe(200)

    const { venueId } = programme(`discount-retired-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 500, id)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('retired')
  })

  test('retiring twice is refused', async () => {
    const { id } = await aDiscount()
    await send('POST', `/api/admin/bar/discounts/${id}/status`, { status: 'RETIRED' })
    expect((await send('POST', `/api/admin/bar/discounts/${id}/status`, { status: 'RETIRED' })).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('applying a discount snapshots it onto each affected line (criteria 2, 3)', () => {
  test('the ledger line carries the name, percentage and computed pence, net of the discount', async () => {
    const { venueId } = programme(`discount-apply-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    const { id: discountId } = await aDiscount(20)
    await openTill(venueId)

    // 500 pence at 20% off is 400.
    const answered = await charge(venueId, [{ variantId, qty: 1 }], 400, discountId)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { totalPence: number, discount: { id: string, name: string, percent: number } | null }
    expect(body.totalPence).toBe(400)
    expect(body.discount).toMatchObject({ id: discountId, percent: 20 })

    const line = latestLedgerLine()
    expect(line).toMatchObject({ amount_pence: 400, discount_id: discountId, discount_percent: 20, discount_pence: 100 })
  })

  test('a later edit to the discount never restates what the line already charged', async () => {
    const { venueId } = programme(`discount-history-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    const { id: discountId, name } = await aDiscount(20)
    await openTill(venueId)

    await charge(venueId, [{ variantId, qty: 1 }], 400, discountId)
    const before = latestLedgerLine()

    // The discount is renamed and re-percentaged after the sale already committed.
    await send('PUT', `/api/admin/bar/discounts/${discountId}`, { name: `${name} (renamed)`, percent: 5 })

    const after = latestLedgerLine()
    expect(after).toEqual(before)
    expect(after?.discount_percent).toBe(20)
  })

  test('an unspecified discount charges the gross total, unaffected', async () => {
    const { venueId } = programme(`discount-none-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 500, null)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { totalPence: number, discount: unknown }
    expect(body.totalPence).toBe(500)
    expect(body.discount).toBeNull()
  })
})

describe.skipIf(skip !== null)('the expected-total cross-check includes the discount (criterion 4, F-104)', () => {
  test('a total that ignores the discount is refused, quoting the true, discounted figure', async () => {
    const { venueId } = programme(`discount-cross-check-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    const { id: discountId } = await aDiscount(20)
    await openTill(venueId)

    // The screen forgot to apply the 20% off: it still expects the gross figure.
    const answered = await charge(venueId, [{ variantId, qty: 1 }], 500, discountId)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£5.00')
    expect(refusal).toContain('£4.00')
  })

  test('the live price check already reflects the discount, so the screen never disagrees with itself', async () => {
    const { venueId } = programme(`discount-price-check-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    const { id: discountId } = await aDiscount(20)
    await openTill(venueId)

    const priced = await send('POST', '/api/till/price', { venueId, lines: [{ variantId, qty: 1 }], discountId }, barManager.cookie)
    expect(priced.status).toBe(200)
    const body = await priced.json() as { totalPence: number, discount: { percent: number } | null }
    expect(body.totalPence).toBe(400)
    expect(body.discount?.percent).toBe(20)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('picking a discount reduces the live total, and the confirmation names it', async () => {
    const { venueId } = programme(`discount-screen-${crypto.randomUUID().slice(0, 6)}`)
    const { variantId } = await aSellableProduct()
    const { id: discountId, name } = await aDiscount(20)
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="discount-${discountId}"]')`)
    await click(view, `[data-test="discount-${discountId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£4.00')`)

    await click(view, `[aria-label="Charge £4.00"]`)
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('£4.00')
    expect(await textOf(view, '[data-test="discount-applied-note"]')).toContain(name)
    view.close()
  }, 120_000)
})
