import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-104 through the real route and screen: a sale is refused, quoting both figures, whenever it
// disagrees with what the till would charge. What a match writes is F-105's own suite.

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
  member = await registerMember(app, 'charge-ordinary', generatePassword())

  barManager = await registerMember(app, 'charge-bar', barPassword)
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

const aCategory = async (): Promise<string> => created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))

const aProductIn = async (categoryId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ...over }))

const activate = (productId: string): Promise<Response> =>
  send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single', ...over }))

const priceVariant = (variantId: string, pricePence: number): Promise<Response> =>
  send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })

// A single, priced, on-the-till size: the shape every charge test starts from.
async function aSellableProduct(over: Record<string, unknown> = {}): Promise<{ productId: string, variantId: string }> {
  const categoryId = await aCategory()
  const productId = await aProductIn(categoryId, over)
  const variantId = await addVariant(productId)
  await priceVariant(variantId, 250)
  await activate(productId)
  return { productId, variantId }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines, expectedTotalPence }, as)

function ledgerCounts(): { entries: number, lines: number } {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const entries = (database.query('SELECT count(*) AS n FROM ledger_entries').get() as { n: number }).n
    const lines = (database.query('SELECT count(*) AS n FROM ledger_lines').get() as { n: number }).n
    return { entries, lines }
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a matching total is accepted (F-104 criterion 1)', () => {
  test('the server confirms the same total it would price the basket at', async () => {
    const { venueId } = programme('charge-match')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await charge(venueId, [{ variantId, qty: 2 }], 500)
    expect(answered.status).toBe(200)
    const body = await answered.json() as { ok: boolean, totalPence: number, entryId: string }
    expect(body.ok).toBe(true)
    expect(body.totalPence).toBe(500)
    // What a match actually commits (the ledger entry, its lines and the stock it depletes) is
    // F-105's own suite, `tests/e2e/till-sale-commit.test.ts`; this only proves the entry exists.
    expect(body.entryId).toBeTruthy()
  })
})

describe.skipIf(skip !== null)('a mismatched total is refused, quoting both figures (F-104 criteria 1, 2)', () => {
  test('the screen\'s figure and the till\'s own are both named, and nothing is written', async () => {
    const { venueId } = programme('charge-mismatch')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const before = ledgerCounts()
    const answered = await charge(venueId, [{ variantId, qty: 2 }], 501)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£5.01')
    expect(refusal).toContain('£5.00')
    expect(ledgerCounts()).toEqual(before)
  })

  test('a stale total, from a price changed after the screen last asked, is refused the same way', async () => {
    const { venueId } = programme('charge-stale')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    // The screen still holds 250; only the till's own recompute knows of this correction.
    await priceVariant(variantId, 300)

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£2.50')
    expect(refusal).toContain('£3.00')
  })

  // Criterion 3: the corrected resubmission runs the full check again, and there is no bypass.
  test('resubmitting with the corrected total succeeds, the same way a first attempt would', async () => {
    const { venueId } = programme('charge-retry')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const first = await charge(venueId, [{ variantId, qty: 1 }], 999)
    expect(first.status).toBe(409)

    const corrected = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(corrected.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('charging needs an open till session', () => {
  test('refused, naming what would unlock it', async () => {
    const { venueId } = programme('charge-no-session')
    const { variantId } = await aSellableProduct()

    const answered = await charge(venueId, [{ variantId, qty: 1 }], 250)
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('till session')
  })
})

describe.skipIf(skip !== null)('who may submit a sale', () => {
  test('the bar manager may, an ordinary member may not, a signed-out caller gets no further', async () => {
    const { venueId } = programme('charge-permission')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    expect((await charge(venueId, [{ variantId, qty: 1 }], 250, member.cookie)).status).toBe(403)
    expect((await request(app, 'POST', '/api/till/sale', { venueId, lines: [{ variantId, qty: 1 }], expectedTotalPence: 250 })).status).toBe(401)
    expect((await charge(venueId, [{ variantId, qty: 1 }], 250)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('charging shows what to key into the reader, and starting the next sale clears the basket', async () => {
    const { variantId } = await aSellableProduct({ name: named('Screen charge') })
    const { venueId } = programme('charge-screen')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('£2.50')

    await click(view, '[data-test="next-sale"]')
    await waitFor(view, `!document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, 'body')).not.toContain('charge-confirmation')
    view.close()
  }, 120_000)

  test('a refused charge shows both figures and leaves the basket to correct', async () => {
    const { variantId } = await aSellableProduct({ name: named('Screen refusal') })
    const { venueId } = programme('charge-screen-refusal')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${variantId}"]`)
    await click(view, `[data-test="variant-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    // A correction lands after the screen last asked, so its remembered total is now wrong.
    await priceVariant(variantId, 300)
    await click(view, `[aria-label="Charge £2.50"]`)

    await waitFor(view, `document.querySelector('[data-test="charge-failure"]')`)
    const refusal = await textOf(view, '[data-test="charge-failure"]')
    expect(refusal).toContain('£2.50')
    expect(refusal).toContain('£3.00')

    // The screen catches itself up to the true figure, so a second tap would now succeed.
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£3.00')`)
    view.close()
  }, 120_000)
})
