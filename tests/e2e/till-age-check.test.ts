import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-106 through the real route: a basket with an age-restricted line needs a Challenge 25
// outcome before it can be charged, and the outcome and the sale commit together.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
const barPassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  barManager = await registerMember(app, 'age-check-bar', barPassword)
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

// A restricted size and an ordinary one, both priced and active, ready for one basket (F-106).
async function aMixedBasketSetup(): Promise<{ venueId: string, restrictedVariantId: string, ordinaryVariantId: string, restrictedProductName: string }> {
  const { venueId } = programme(`age-check-${crypto.randomUUID().slice(0, 6)}`)
  const categoryId = await aCategory()
  const restrictedProductName = named('Gin')
  const restrictedProductId = await aProductIn(categoryId, { name: restrictedProductName, ageRestricted: true })
  const restrictedVariantId = await addVariant(restrictedProductId)
  await priceVariant(restrictedVariantId, 250)
  await activate(restrictedProductId)

  const ordinaryProductId = await aProductIn(categoryId, { ageRestricted: false })
  const ordinaryVariantId = await addVariant(ordinaryProductId)
  await priceVariant(ordinaryVariantId, 300)
  await activate(ordinaryProductId)

  await openTill(venueId)
  return { venueId, restrictedVariantId, ordinaryVariantId, restrictedProductName }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, ageCheck: unknown, as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/till/sale', { venueId, lines, expectedTotalPence, ageCheck }, as)

interface Counts { entries: number, lines: number, movements: number, ageChecks: number, ageCheckAudits: number, saleAudits: number }

function counts(): Counts {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const one = (table: string): number => (database.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
    return {
      entries: one('ledger_entries'),
      lines: one('ledger_lines'),
      movements: one('stock_movements'),
      ageChecks: one('age_checks'),
      ageCheckAudits: (database.query(`SELECT count(*) AS n FROM audit_log WHERE action = 'age-check.logged'`).get() as { n: number }).n,
      saleAudits: (database.query(`SELECT count(*) AS n FROM audit_log WHERE action = 'bar.till.sale'`).get() as { n: number }).n,
    }
  }
  finally {
    database.close()
  }
}

interface AgeCheckRow { id: string, performance_id: string | null, outcome: string, id_type: string | null, reason: string | null, description: string, product: string | null }

function latestAgeCheck(): AgeCheckRow | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT * FROM age_checks ORDER BY created_at DESC, rowid DESC LIMIT 1').get() as AgeCheckRow | undefined
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a restricted basket is refused with no outcome on record (F-106 criteria 1, 5)', () => {
  test('the refusal names what needs a Challenge 25 check, and nothing is written', async () => {
    const { venueId, restrictedVariantId, restrictedProductName } = await aMixedBasketSetup()

    const before = counts()
    const answered = await charge(venueId, [{ variantId: restrictedVariantId, qty: 1 }], 250, null)
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain(restrictedProductName)
    expect(refusal).toContain('Challenge 25')
    expect(counts()).toEqual(before)
  })

  test('an ordinary basket needs no outcome at all', async () => {
    const { venueId, ordinaryVariantId } = await aMixedBasketSetup()
    const answered = await charge(venueId, [{ variantId: ordinaryVariantId, qty: 1 }], 300, null)
    expect(answered.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('accepted sells the whole basket and logs the check (F-106 criteria 1, 2)', () => {
  test('one ledger entry, every line, and one age check row, all in the same commit', async () => {
    const { venueId, restrictedVariantId, ordinaryVariantId } = await aMixedBasketSetup()

    const before = counts()
    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }, { variantId: ordinaryVariantId, qty: 1 }],
      550,
      { outcome: 'ACCEPTED', idType: 'PASSPORT', description: 'Tall man, grey coat' },
    )
    expect(answered.status).toBe(200)
    const body = await answered.json() as { entryId: string, totalPence: number, lines: unknown[], ageCheck: { id: string, outcome: string }, refusedLines: unknown[] }
    expect(body.entryId).toBeTruthy()
    expect(body.totalPence).toBe(550)
    expect(body.lines).toHaveLength(2)
    expect(body.refusedLines).toHaveLength(0)
    expect(body.ageCheck).toMatchObject({ outcome: 'ACCEPTED' })

    const after = counts()
    expect(after.entries).toBe(before.entries + 1)
    expect(after.lines).toBe(before.lines + 2)
    expect(after.ageChecks).toBe(before.ageChecks + 1)
    expect(after.ageCheckAudits).toBe(before.ageCheckAudits + 1)
    expect(after.saleAudits).toBe(before.saleAudits + 1)

    const row = latestAgeCheck()
    expect(row).toMatchObject({ outcome: 'ACCEPTED', id_type: 'PASSPORT', reason: null })
    expect(row?.product).toBeTruthy()
  })
})

describe.skipIf(skip !== null)('refused drops the restricted lines and sells the remainder (F-106 criterion 3)', () => {
  test('the age check logs the refusal, and only the ordinary line is charged', async () => {
    const { venueId, restrictedVariantId, ordinaryVariantId } = await aMixedBasketSetup()

    const before = counts()
    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }, { variantId: ordinaryVariantId, qty: 1 }],
      300,
      { outcome: 'REFUSED', reason: 'NO_ID_SHOWN', description: 'Declined to show ID' },
    )
    expect(answered.status).toBe(200)
    const body = await answered.json() as { entryId: string, totalPence: number, lines: { variantId: string }[], refusedLines: { variantId: string }[] }
    expect(body.totalPence).toBe(300)
    expect(body.lines).toHaveLength(1)
    expect(body.lines[0]!.variantId).toBe(ordinaryVariantId)
    expect(body.refusedLines).toHaveLength(1)
    expect(body.refusedLines[0]!.variantId).toBe(restrictedVariantId)

    const after = counts()
    expect(after.lines).toBe(before.lines + 1)
    expect(after.ageChecks).toBe(before.ageChecks + 1)

    const row = latestAgeCheck()
    expect(row).toMatchObject({ outcome: 'REFUSED', reason: 'NO_ID_SHOWN', id_type: null })
  })

  test('a basket that is only the restricted line sells nothing, but still logs the refusal', async () => {
    const { venueId, restrictedVariantId } = await aMixedBasketSetup()

    const before = counts()
    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }],
      0,
      { outcome: 'REFUSED', reason: 'APPEARED_UNDERAGE', description: 'Looked well under 18' },
    )
    expect(answered.status).toBe(200)
    const body = await answered.json() as { entryId: string | null, totalPence: number, lines: unknown[] }
    expect(body.entryId).toBeNull()
    expect(body.totalPence).toBe(0)
    expect(body.lines).toHaveLength(0)

    const after = counts()
    expect(after.entries).toBe(before.entries)
    expect(after.movements).toBe(before.movements)
    expect(after.ageChecks).toBe(before.ageChecks + 1)
    expect(after.saleAudits).toBe(before.saleAudits)
  })
})

describe.skipIf(skip !== null)('the expected-total cross-check still applies to what is actually charged (F-104, F-106)', () => {
  test('a stale total for the reduced basket is refused, quoting the true, smaller figure', async () => {
    const { venueId, restrictedVariantId, ordinaryVariantId } = await aMixedBasketSetup()

    // The screen has not caught up to the drop yet: it still expects the full, unreduced total.
    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }, { variantId: ordinaryVariantId, qty: 1 }],
      550,
      { outcome: 'REFUSED', reason: 'NO_ID_SHOWN', description: 'Declined to show ID' },
    )
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain('£5.50')
    expect(refusal).toContain('£3.00')
  })
})

describe.skipIf(skip !== null)('every restricted product is named when more than one needs an outcome', () => {
  test('two restricted lines name both products', async () => {
    const { venueId, restrictedVariantId, restrictedProductName } = await aMixedBasketSetup()
    const categoryId = await aCategory()
    const secondName = named('Vodka')
    const secondProductId = await aProductIn(categoryId, { name: secondName, ageRestricted: true })
    const secondVariantId = await addVariant(secondProductId, { label: 'Single', servingKind: 'single' })
    await priceVariant(secondVariantId, 275)
    await activate(secondProductId)

    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }, { variantId: secondVariantId, qty: 1 }],
      525,
      null,
    )
    expect(answered.status).toBe(409)
    const refusal = await message(answered)
    expect(refusal).toContain(restrictedProductName)
    expect(refusal).toContain(secondName)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('accepting is the ID type tap: the modal opens, one tap sells the whole basket', async () => {
    const { venueId, restrictedVariantId } = await aMixedBasketSetup()

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${restrictedVariantId}"]`)
    await click(view, `[data-test="variant-${restrictedVariantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-id-PASSPORT"]')`)
    await click(view, '[data-test="age-check-id-PASSPORT"]')

    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('£2.50')
    view.close()
  }, 120_000)

  test('refusing needs a reason and a description, then sells only the rest of the basket', async () => {
    const { venueId, restrictedVariantId, ordinaryVariantId } = await aMixedBasketSetup()

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="variant-${restrictedVariantId}"]`)
    await click(view, `[data-test="variant-${restrictedVariantId}"]`)
    await click(view, `[data-test="variant-${ordinaryVariantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£5.50')`)

    await click(view, `[aria-label="Charge £5.50"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-refuse"]')`)
    await click(view, '[data-test="age-check-refuse"]')

    // A refusal with no reason and no description names both, and neither submits early.
    await click(view, '[data-test="age-check-confirm-refuse"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-error"]')`)

    await click(view, '[data-test="age-check-reason-NO_ID_SHOWN"]')
    await fill(view, '[data-test="age-check-description"]', 'Declined to show ID')
    await click(view, '[data-test="age-check-confirm-refuse"]')

    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(await textOf(view, '[data-test="charge-confirmation"]')).toContain('£3.00')
    expect(await textOf(view, '[data-test="age-check-refused-note"]')).toContain('Not sold')
    view.close()
  }, 120_000)
})
