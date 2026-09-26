import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { sellOnTheTill } from '#tests/helpers/till'
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
    const made = tonightsPerformance(sqliteTarget(database), { suffix })
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

interface MixedBasket {
  venueId: string
  restrictedVariantId: string
  ordinaryVariantId: string
  restrictedProductId: string
  ordinaryProductId: string
  restrictedProductName: string
}

// A restricted size and an ordinary one, both priced and active, ready for one basket (F-106).
async function aMixedBasketSetup(): Promise<MixedBasket> {
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
  return { venueId, restrictedVariantId, ordinaryVariantId, restrictedProductId, ordinaryProductId, restrictedProductName }
}

const charge = (venueId: string, lines: unknown[], expectedTotalPence: number, ageCheck: unknown, as = barManager.cookie): Promise<Response> =>
  sellOnTheTill(app, { venueId, lines, expectedTotalPence, ageCheck }, as)

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

describe.skipIf(skip !== null)('visibly over 25 sells the line and writes its own register entry (F-106 criterion 7, 0085)', () => {
  test('the sale goes through, and the register entry names neither an ID nor a reason', async () => {
    const { venueId, restrictedVariantId, ordinaryVariantId } = await aMixedBasketSetup()

    const before = counts()
    const answered = await charge(
      venueId,
      [{ variantId: restrictedVariantId, qty: 1 }, { variantId: ordinaryVariantId, qty: 1 }],
      550,
      { outcome: 'NOT_REQUIRED' },
    )
    expect(answered.status).toBe(200)
    const body = await answered.json() as { entryId: string, totalPence: number, lines: unknown[], ageCheck: { id: string, outcome: string }, refusedLines: unknown[] }
    expect(body.totalPence).toBe(550)
    expect(body.lines).toHaveLength(2)
    expect(body.refusedLines).toHaveLength(0)
    expect(body.ageCheck).toMatchObject({ outcome: 'NOT_REQUIRED' })
    expect(body.ageCheck.id).toBeTruthy()

    const after = counts()
    expect(after.entries).toBe(before.entries + 1)
    expect(after.ageChecks).toBe(before.ageChecks + 1)
    expect(after.ageCheckAudits).toBe(before.ageCheckAudits + 1)
    expect(after.saleAudits).toBe(before.saleAudits + 1)

    const row = latestAgeCheck()
    expect(row).toMatchObject({ outcome: 'NOT_REQUIRED', id_type: null, reason: null, description: '' })
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

// Issue 1299, F-106 criterion 1, F-111 criterion 6: a line's Check ID follows what it pours. The
// product's own switch adds it to one pouring nothing restricted, and never takes it away.
describe.skipIf(skip !== null)('Check ID follows what a line pours, whatever the product is switched to (issue 1299)', () => {
  async function anItem(ageRestricted: boolean): Promise<{ id: string, name: string }> {
    const name = named(ageRestricted ? 'Rum' : 'Lemonade')
    return { id: await created(await send('POST', '/api/admin/bar/items', { name, unit: 'ML', containerMl: 1000, ageRestricted })), name }
  }

  const deliver = async (item: { id: string }): Promise<void> => {
    expect((await send('POST', '/api/admin/bar/movements', { itemId: item.id, kind: 'DELIVERY', qty: 5000, unitCostPence: 1 })).status).toBe(200)
  }

  // Switched off, so only what it pours can ask for Check ID.
  async function anUnrestrictedProduct(): Promise<{ productId: string, variantId: string }> {
    const productId = await aProductIn(await aCategory(), { name: named('Punch'), ageRestricted: false })
    const variantId = await addVariant(productId)
    expect((await priceVariant(variantId, 400)).status).toBe(200)
    return { productId, variantId }
  }

  async function onTheTill(productId: string): Promise<string> {
    expect((await activate(productId)).status).toBe(200)
    const { venueId } = programme(`check-id-${crypto.randomUUID().slice(0, 6)}`)
    await openTill(venueId)
    return venueId
  }

  test('a recipe pouring a restricted item asks, though the product was never switched on', async () => {
    const rum = await anItem(true)
    await deliver(rum)
    const { productId, variantId } = await anUnrestrictedProduct()
    // The recipe editor has no Check ID guard of its own: the till derives it at the sale.
    expect((await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId: rum.id, qty: 25 }] })).status).toBe(200)
    const venueId = await onTheTill(productId)

    const before = counts()
    const refused = await charge(venueId, [{ variantId, qty: 1 }], 400, null)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('Challenge 25')
    expect(counts()).toEqual(before)

    const sold = await charge(venueId, [{ variantId, qty: 1 }], 400, { outcome: 'ACCEPTED', idType: 'PASSPORT', description: 'Checked at the bar' })
    expect(sold.status).toBe(200)
    expect(counts().ageChecks).toBe(before.ageChecks + 1)
  })

  test('a choice asks only when the option chosen is restricted', async () => {
    const rum = await anItem(true)
    const ice = await anItem(false)
    await deliver(rum)
    await deliver(ice)
    const { productId, variantId } = await anUnrestrictedProduct()
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', { name: named('Extras'), options: [{ itemId: rum.id, qty: 25 }, { itemId: ice.id, qty: 10 }] }))
    expect((await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })).status).toBe(200)
    const venueId = await onTheTill(productId)

    const group = (await (await send('GET', '/api/admin/bar/choice-groups')).json() as { groups: { id: string, options: { id: string, itemId: string }[] }[] })
      .groups.find(entry => entry.id === groupId)!
    const optionFor = (item: { id: string }): string => group.options.find(option => option.itemId === item.id)!.id

    expect((await charge(venueId, [{ variantId, qty: 1, choiceItemId: optionFor(ice) }], 400, null)).status).toBe(200)
    const refused = await charge(venueId, [{ variantId, qty: 1, choiceItemId: optionFor(rum) }], 400, null)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('Challenge 25')
  })

  test('an item switched to restricted after set-up asks from the next sale on', async () => {
    const punch = await anItem(false)
    await deliver(punch)
    const { productId, variantId } = await anUnrestrictedProduct()
    expect((await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId: punch.id, qty: 25 }] })).status).toBe(200)
    const venueId = await onTheTill(productId)
    expect((await charge(venueId, [{ variantId, qty: 1 }], 400, null)).status).toBe(200)

    expect((await send('PUT', `/api/admin/bar/items/${punch.id}`, { name: punch.name, unit: 'ML', containerMl: 1000, ageRestricted: true })).status).toBe(200)

    const refused = await charge(venueId, [{ variantId, qty: 1 }], 400, null)
    expect(refused.status).toBe(409)
    expect(await message(refused)).toContain('Challenge 25')
  })

  test('the till marks the tile, the size and the option from what they pour', async () => {
    const rum = await anItem(true)
    const ice = await anItem(false)
    const { productId, variantId } = await anUnrestrictedProduct()
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', { name: named('Extras'), options: [{ itemId: rum.id, qty: 25 }, { itemId: ice.id, qty: 10 }] }))
    expect((await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })).status).toBe(200)
    const venueId = await onTheTill(productId)

    const catalogue = await (await send('GET', `/api/till/products?venueId=${venueId}`, undefined, barManager.cookie)).json() as {
      products: { id: string, ageRestricted: boolean, variants: { id: string, ageRestricted: boolean, choice: { options: { itemName: string, ageRestricted: boolean }[] } | null }[] }[]
    }
    const product = catalogue.products.find(entry => entry.id === productId)!
    expect(product.ageRestricted).toBe(true)
    const size = product.variants.find(entry => entry.id === variantId)!
    expect(size.ageRestricted).toBe(false)
    expect(size.choice?.options.filter(option => option.ageRestricted)).toHaveLength(1)
  })
})

// One tap in, not one charge in (F-106 criterion 6, issue 1150 item 5). These wait for the
// nightly browser run; they are not a CI gate.
describe.skipIf(skip !== null)('the screen asks before the drink is poured', () => {
  async function atTheTill(venueId: string, waitFor_: string) {
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, waitFor_)
    return view
  }

  test('a restricted tile carries a mark in text, not colour alone', async () => {
    const { venueId, restrictedProductId, ordinaryProductId } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${restrictedProductId}"]`)

    expect(await textOf(view, `[data-test="restricted-mark-${restrictedProductId}"]`)).toContain('ID')
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="restricted-mark-${ordinaryProductId}"]') === null`)).toBe(true)
    view.close()
  }, 120_000)

  test('the first restricted tap opens Challenge 25 naming the product, and one ID tap gets on with the sale', async () => {
    const { venueId, restrictedProductId, restrictedProductName } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${restrictedProductId}"]`)

    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-id-PASSPORT"]')`)
    expect(await textOf(view, '[data-test="age-check-product"]')).toContain(restrictedProductName)

    await click(view, '[data-test="age-check-id-PASSPORT"]')
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    // The basket already passed, so charging does not ask a second time.
    await click(view, `[aria-label="Charge £2.50"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-took-it"]')`)
    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    view.close()
  }, 120_000)

  test('Visibly over 25 is one press, asks nothing else, and lands on the register with the sale', async () => {
    const { venueId, restrictedProductId } = await aMixedBasketSetup()
    const before = counts()
    const view = await atTheTill(venueId, `[data-test="product-${restrictedProductId}"]`)

    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-not-required"]')`)
    expect(await textOf(view, '[data-test="age-check-not-required"]')).toContain('Visibly over 25')
    await click(view, '[data-test="age-check-not-required"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-not-required"]') === null`)

    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£5.00')`)
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="age-check-not-required"]') === null`)).toBe(true)

    await click(view, `[aria-label="Charge £5.00"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-took-it"]')`)
    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    expect(counts().ageChecks).toBe(before.ageChecks + 1)
    expect(latestAgeCheck()).toMatchObject({ outcome: 'NOT_REQUIRED', id_type: null, reason: null })
    view.close()
  }, 120_000)

  test('a basket that already passed does not ask again on the next restricted tap', async () => {
    const { venueId, restrictedProductId } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${restrictedProductId}"]`)

    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-id-PASSPORT"]')`)
    await click(view, '[data-test="age-check-id-PASSPORT"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-id-PASSPORT"]') === null`)

    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£5.00')`)
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="age-check-id-PASSPORT"]') === null`)).toBe(true)
    view.close()
  }, 120_000)

  test('refusing at the tap takes the line back out, says so, and leaves the rest sellable', async () => {
    const { venueId, restrictedProductId, ordinaryProductId, restrictedProductName } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${ordinaryProductId}"]`)

    await click(view, `[data-test="product-${ordinaryProductId}"]`)
    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-refuse"]')`)
    await click(view, '[data-test="age-check-refuse"]')

    // A refusal with no reason and no description names both, and neither submits early.
    await click(view, '[data-test="age-check-confirm-refuse"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-error"]')`)

    await click(view, '[data-test="age-check-reason-NO_ID_SHOWN"]')
    await fill(view, '[data-test="age-check-description"]', 'Declined to show ID')
    await click(view, '[data-test="age-check-confirm-refuse"]')

    await waitFor(view, `document.querySelector('[data-test="age-check-not-sold"]')`)
    expect(await textOf(view, '[data-test="age-check-not-sold"]')).toContain(restrictedProductName)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£3.00')`)

    await click(view, `[aria-label="Charge £3.00"]`)
    await waitFor(view, `document.querySelector('[data-test="reader-took-it"]')`)
    await click(view, '[data-test="reader-took-it"]')
    await waitFor(view, `document.querySelector('[data-test="charge-confirmation"]')`)
    view.close()
  }, 120_000)

  // 0096 writes a card sale only once the reader answers, so a refusal given at the charge cannot
  // ride the sale: it is on the register at once, and a declined card leaves it there.
  test('a refusal given at the charge stays on the register when the card is then declined', async () => {
    const { venueId, restrictedProductId, ordinaryProductId, restrictedProductName } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${ordinaryProductId}"]`)

    await click(view, `[data-test="product-${ordinaryProductId}"]`)
    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-refuse"]')`)
    // Closed rather than answered, so the charge is what asks.
    await view.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(button => (button.getAttribute('aria-label') || '').toLowerCase().includes('close')).click()`)
    await waitFor(view, `!document.querySelector('[data-test="age-check-refuse"]')`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£5.50')`)

    const before = counts()
    await click(view, `[aria-label="Charge £5.50"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-refuse"]')`)
    await click(view, '[data-test="age-check-refuse"]')
    await click(view, '[data-test="age-check-reason-NO_ID_SHOWN"]')
    await fill(view, '[data-test="age-check-description"]', 'Declined to show ID')
    await click(view, '[data-test="age-check-confirm-refuse"]')

    await waitFor(view, `document.querySelector('[data-test="reader-charge"]')`)
    expect(await textOf(view, '[data-test="charge-amount-figure"]')).toContain('£3.00')
    expect(counts().ageChecks).toBe(before.ageChecks + 1)

    await click(view, '[data-test="card-declined"]')
    await waitFor(view, `document.querySelector('[data-test="charge-failure"]')`)
    expect(counts()).toMatchObject({ entries: before.entries, ageChecks: before.ageChecks + 1 })
    const row = latestAgeCheck()
    expect(row).toMatchObject({ outcome: 'REFUSED', reason: 'NO_ID_SHOWN' })
    expect(row?.product).toContain(restrictedProductName)
    view.close()
  }, 120_000)

  test('the refusal is on the register before the rest of the basket is charged (F-106 criterion 6)', async () => {
    const { venueId, restrictedProductId, restrictedProductName } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${restrictedProductId}"]`)

    const before = counts()
    await click(view, `[data-test="product-${restrictedProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="age-check-refuse"]')`)
    await click(view, '[data-test="age-check-refuse"]')
    await click(view, '[data-test="age-check-reason-NO_ID_SHOWN"]')
    await fill(view, '[data-test="age-check-description"]', 'Declined to show ID')
    await click(view, '[data-test="age-check-confirm-refuse"]')
    await waitFor(view, `document.querySelector('[data-test="age-check-not-sold"]')`)

    expect(counts().ageChecks).toBe(before.ageChecks + 1)
    const row = latestAgeCheck()
    expect(row).toMatchObject({ outcome: 'REFUSED', reason: 'NO_ID_SHOWN', id_type: null })
    expect(row?.product).toContain(restrictedProductName)
    view.close()
  }, 120_000)

  // F-104 criterion 6 as amended by 0096: the one number the typed attempt is read for.
  test('the amount to key into the reader is the display figure, in the mono face', async () => {
    const { venueId, ordinaryProductId } = await aMixedBasketSetup()
    const view = await atTheTill(venueId, `[data-test="product-${ordinaryProductId}"]`)

    await click(view, `[data-test="product-${ordinaryProductId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£3.00')`)
    await click(view, `[aria-label="Charge £3.00"]`)
    await waitFor(view, `document.querySelector('[data-test="charge-amount-figure"]')`)

    expect(await textOf(view, '[data-test="charge-amount-figure"]')).toContain('£3.00')
    const figure = `(() => {
      const style = getComputedStyle(document.querySelector('[data-test="charge-amount-figure"]'))
      return { size: parseFloat(style.fontSize), mono: style.fontFamily.toLowerCase().includes('mono') }
    })()`
    const shown = await view.evaluate<{ size: number, mono: boolean }>(figure)
    expect(shown.mono).toBe(true)
    expect(shown.size).toBeGreaterThanOrEqual(36)
    view.close()
  }, 120_000)
})
