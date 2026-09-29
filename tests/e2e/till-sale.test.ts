import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, finishSignIn, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import { putOnTheTill } from '#tests/helpers/bar'
import type { TestMember } from '#tests/helpers/accounts'

// F-103 and F-107 through the real routes and the real screen: what the till may sell right now,
// pricing a basket against live prices, and the allergen affordance on every tile and line.

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
  member = await registerMember(app, 'sale-ordinary', generatePassword())

  barManager = await registerMember(app, 'sale-bar', barPassword)
  await grantRole(app, barManager, 'BAR_MANAGER', officer.cookie)
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

const aCategory = async (): Promise<string> => created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))

const aProductIn = async (categoryId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId, ...over }))

const activate = (productId: string): Promise<Response> =>
  putOnTheTill(send, productId)

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single', ...over }))

const priceVariant = (variantId: string, pricePence: number): Promise<Response> =>
  send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence, effectiveFrom: today() })

const anItem = async (over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/items', { name: named('Tonic'), unit: 'ML', containerMl: 200, ageRestricted: false, ...over }))

// The till answers allergens from the stock a size pours (issue 1348), so they are recorded there.
async function aProductPouring(name: string, allergenNotes: string): Promise<{ productId: string }> {
  const itemId = await anItem({ name: named(`${name} stock`), allergenState: 'RECORDED', allergenNotes })
  expect((await send('POST', '/api/admin/bar/movements', { itemId, kind: 'DELIVERY', qty: 5000, costPence: 5000 })).status).toBe(200)
  const productId = await aProductIn(await aCategory(), { name: named(name) })
  const variantId = await addVariant(productId)
  await priceVariant(variantId, 250)
  expect((await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })).status).toBe(200)
  await activate(productId)
  return { productId }
}

// A single, priced, on-the-till size: the shape every till test starts from.
async function aSellableProduct(over: Record<string, unknown> = {}): Promise<{ productId: string, variantId: string, categoryId: string }> {
  const categoryId = await aCategory()
  const productId = await aProductIn(categoryId, over)
  const variantId = await addVariant(productId)
  await priceVariant(variantId, 250)
  await activate(productId)
  return { productId, variantId, categoryId }
}

interface ListedCatalogue {
  on: string
  categories: { id: string, name: string }[]
  products: { id: string, name: string, allergenState: string, allergenNote: string | null, variants: { id: string, label: string, pricePence: number, priceSource: string, choice: { id: string, name: string, options: { id: string, itemName: string }[] } | null }[] }[]
}

const catalogue = (venueId: string, as = barManager.cookie): Promise<Response> =>
  send('GET', `/api/till/products?venueId=${venueId}`, undefined, as)

const price = (venueId: string, lines: unknown[], as = barManager.cookie): Promise<Response> =>
  send('POST', '/api/till/price', { venueId, lines }, as)

describe.skipIf(skip !== null)('what the till may sell right now (F-103 criterion 1)', () => {
  test('an active, priced size is on the till', async () => {
    const { venueId } = programme('sale-basic')
    const { productId, variantId } = await aSellableProduct()
    await openTill(venueId)

    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    const product = listed.products.find(entry => entry.id === productId)
    expect(product?.variants.map(variant => variant.id)).toContain(variantId)
    expect(product?.variants.find(variant => variant.id === variantId)?.pricePence).toBe(250)
  })

  // The pre-F-112 activation gap (known-issues.md): `missingBeforeActive` only runs on the
  // transition to `ACTIVE`, so a product active from before then keeps its status with no size.
  test('an ACTIVE product with no variant at all is not on the till', async () => {
    const { venueId } = programme('sale-no-variant')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)

    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE bar_products SET status = \'ACTIVE\' WHERE id = ?').run(productId)
    }
    finally {
      database.close()
    }

    await openTill(venueId)
    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    expect(listed.products.find(entry => entry.id === productId)).toBeUndefined()
  })

  test('an unpriced variant does not appear, though its product may have another that does', async () => {
    const { venueId } = programme('sale-unpriced')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const priced = await addVariant(productId, { servingKind: 'single', label: 'Single' })
    const unpriced = await addVariant(productId, { servingKind: 'double', label: 'Double' })
    await priceVariant(priced, 250)
    await activate(productId)

    await openTill(venueId)
    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    const variantIds = listed.products.find(entry => entry.id === productId)?.variants.map(variant => variant.id) ?? []
    expect(variantIds).toContain(priced)
    expect(variantIds).not.toContain(unpriced)
  })

  test('a category default prices a variant with no price of its own', async () => {
    const { venueId } = programme('sale-default')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)
    await send('POST', `/api/admin/bar/categories/${categoryId}/prices`, { servingKind: 'single', pricePence: 300, effectiveFrom: today() })
    await activate(productId)

    await openTill(venueId)
    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    const variant = listed.products.find(entry => entry.id === productId)?.variants.find(entry => entry.id === variantId)
    expect(variant?.pricePence).toBe(300)
    expect(variant?.priceSource).toBe('category')
  })

  test('a variant with a choice group carries its options', async () => {
    const { venueId } = programme('sale-choice')
    const { productId, variantId } = await aSellableProduct()
    const itemName = named('Tonic')
    const itemId = await anItem({ name: itemName })
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', {
      name: named('Mixers'),
      options: [{ itemId, qty: 50 }],
    }))
    await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })

    await openTill(venueId)
    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    const choice = listed.products.find(entry => entry.id === productId)?.variants.find(entry => entry.id === variantId)?.choice
    expect(choice?.name).toBeTruthy()
    expect(choice?.options.map(option => option.itemName)).toContain(itemName)
  })

  test('who may read it: the bar manager, not an ordinary member, not signed out', async () => {
    const { venueId } = programme('sale-permission')
    await aSellableProduct()

    expect((await catalogue(venueId)).status).toBe(200)
    expect((await catalogue(venueId, member.cookie)).status).toBe(403)
    expect((await request(app, 'GET', `/api/till/products?venueId=${venueId}`)).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('the authoritative total for a basket (F-103 criterion 3)', () => {
  test('the server recomputes each line from live prices, never the caller\'s own arithmetic', async () => {
    const { venueId } = programme('sale-total')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await price(venueId, [{ variantId, qty: 3, amountPence: 1 }])
    expect(answered.status).toBe(200)
    const body = await answered.json() as { totalPence: number, lines: { amountPence: number, unitPricePence: number }[] }
    expect(body.lines[0]).toMatchObject({ unitPricePence: 250, amountPence: 750 })
    expect(body.totalPence).toBe(750)
  })

  test('several lines sum to the total', async () => {
    const { venueId } = programme('sale-multi')
    const first = await aSellableProduct()
    const second = await aSellableProduct()
    await openTill(venueId)

    const answered = await price(venueId, [
      { variantId: first.variantId, qty: 1 },
      { variantId: second.variantId, qty: 2 },
    ])
    const body = await answered.json() as { totalPence: number }
    expect(body.totalPence).toBe(250 + 250 * 2)
  })

  test('a line naming a variant the till cannot sell is refused by name', async () => {
    const { venueId } = programme('sale-refuse-variant')
    await openTill(venueId)

    const answered = await price(venueId, [{ variantId: 'no-such-variant', qty: 1 }])
    expect(answered.status).toBe(422)
  })

  test('a variant offering a choice refuses a line with none picked', async () => {
    const { venueId } = programme('sale-refuse-choice')
    const { variantId } = await aSellableProduct()
    const itemId = await anItem()
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', { name: named('Mixers'), options: [{ itemId, qty: 50 }] }))
    await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })
    await openTill(venueId)

    const answered = await price(venueId, [{ variantId, qty: 1 }])
    expect(answered.status).toBe(422)
  })

  test('a choice supplied where the variant offers none is refused', async () => {
    const { venueId } = programme('sale-refuse-extra-choice')
    const { variantId } = await aSellableProduct()
    await openTill(venueId)

    const answered = await price(venueId, [{ variantId, qty: 1, choiceItemId: 'something' }])
    expect(answered.status).toBe(422)
  })

  test('pricing a basket needs an open till session', async () => {
    const { venueId } = programme('sale-no-session')
    const { variantId } = await aSellableProduct()

    const answered = await price(venueId, [{ variantId, qty: 1 }])
    expect(answered.status).toBe(409)
    expect(await message(answered)).toContain('till session')
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  test('tapping a size adds it, the choice modal prompts, and the total is server-computed', async () => {
    const { venueId } = programme('sale-screen')
    const { productId, variantId } = await aSellableProduct({ name: named('Screen gin') })
    const itemId = await anItem({ name: named('Screen tonic') })
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', { name: named('Screen mixers'), options: [{ itemId, qty: 50 }] }))
    await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true })
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="choice-option-${await optionIdFor(groupId, itemId)}"]')`)
    await click(view, `[data-test="choice-option-${await optionIdFor(groupId, itemId)}"]`)

    await waitFor(view, `document.querySelector('[data-test="basket"]')`)
    expect(await textOf(view, '[data-test="basket"]')).toContain('Screen gin')

    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)

    // Editing and removal never leave the screen: the basket panel updates in place.
    const lineId = await lineIdFrom(view)
    await click(view, `[data-test="line-plus-${lineId}"]`)
    await waitFor(view, `document.querySelector('[data-test="line-qty-${lineId}"]') && document.querySelector('[data-test="line-qty-${lineId}"]').textContent.trim() === '2'`)
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£5.00')`)

    await click(view, `[data-test="line-remove-${lineId}"]`)
    await waitFor(view, `!document.querySelector('[data-test="basket"]')`)

    view.close()
  }, 120_000)

  // Issue 1314: the mixer sheet has a way back, and a size that may be served neat offers no mixer.
  test('the mixer sheet goes Back without adding anything, and an optional one sells neat', async () => {
    const { venueId } = programme('sale-neat')
    const { productId, variantId } = await aSellableProduct({ name: named('Screen whisky') })
    const itemId = await anItem({ name: named('Screen soda') })
    const groupId = await created(await send('POST', '/api/admin/bar/choice-groups', { name: named('Screen mixer'), options: [{ itemId, qty: 50 }] }))
    await send('PUT', `/api/admin/bar/variants/${variantId}/choice`, { choiceGroupId: groupId, qty: 1, includedInPrice: true, optional: true })
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await click(view, '[data-test="choice-back"]')
    await waitFor(view, `!document.querySelector('[data-test="choice-back"]')`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="basket"]')`)).toBe(false)

    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="choice-none"]')`)
    expect(await textOf(view, '[data-test="choice-none"]')).toContain('No screen mixer')
    await click(view, '[data-test="choice-none"]')
    await waitFor(view, `document.querySelector('[data-test="basket-total-amount"]') && document.querySelector('[data-test="basket-total-amount"]').textContent.includes('£2.50')`)
    expect(await textOf(view, '[data-test="basket"]')).toContain('Screen whisky')
    view.close()
  }, 120_000)

  // 0083: the sizes are a sheet off the tile, so a wine at 360 pixels is two large taps rather
  // than four pills wrapped inside half a card.
  test('a product with several sizes opens the size sheet, and the size chosen there lands in the basket', async () => {
    const { venueId } = programme('sale-sizes')
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId, { name: named('Screen red') })
    const small = await addVariant(productId, { servingKind: '175ml', label: '175ml glass' })
    const large = await addVariant(productId, { servingKind: '250ml', label: '250ml glass' })
    await priceVariant(small, 350)
    await priceVariant(large, 480)
    await activate(productId)
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    expect(await textOf(view, `[data-test="product-${productId}"]`)).toContain('From £3.50')

    // The tile adds nothing on its own: the sizes are the sheet's, and the sheet is titled for
    // the product it came from.
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="size-sheet"]')`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="basket"]')`)).toBe(false)
    expect(await textOf(view, '[data-test="size-sheet"]')).toContain('£4.80')

    await click(view, `[data-test="variant-${large}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket"]')`)
    await waitFor(view, `!document.querySelector('[data-test="size-sheet"]')`)
    expect(await textOf(view, '[data-test="basket"]')).toContain('250ml glass')
    view.close()
  }, 120_000)

  test('the allergen affordance shows the state without leaving the sale (F-107 criteria 1, 2, 3)', async () => {
    const { venueId } = programme('sale-allergen')
    const { productId } = await aProductPouring('Screen note', 'Contains nuts')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="allergen-${productId}"]`)
    await click(view, `[data-test="allergen-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="allergen-note"]')`)
    expect(await textOf(view, '[data-test="allergen-state"]')).toContain('Allergens recorded')
    expect(await textOf(view, '[data-test="allergen-note"]')).toContain('Contains nuts')

    // Closing the note returns to the same basket, not away from it.
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket"]')`)
    expect(await textOf(view, '[data-test="basket"]')).toContain('Screen note')
    view.close()
  }, 120_000)

  // F-107 criterion 1: the affordance is on every basket line too, not only the tile above it,
  // since the question usually comes after the round is rung up.
  test('the allergen affordance is also on the basket line', async () => {
    const { venueId } = programme('sale-allergen-line')
    await aProductPouring('Basket line note', 'Contains gluten')
    await openTill(venueId)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    await click(view, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="basket"]')`)

    await view.evaluate(`document.querySelector('[data-test="basket"] [aria-label^="Allergens for"]').click()`)
    await waitFor(view, `document.querySelector('[data-test="allergen-note"]')`)
    expect(await textOf(view, '[data-test="allergen-state"]')).toContain('Allergens recorded')
    expect(await textOf(view, '[data-test="allergen-note"]')).toContain('Contains gluten')
    view.close()
  }, 120_000)

  // Issue 1348 (F-107 criteria 1 and 4): the till reads a product's answer from the stock it pours,
  // answered once on the stocked item, so a wine says what its bottle contains.
  test('a tile\'s allergens are read from the stock it pours, named item by item', async () => {
    const { venueId } = programme('sale-allergen-poured')
    const { productId, variantId } = await aSellableProduct({ name: named('Poured note') })
    const wine = named('Poured red')
    const itemId = await anItem({ name: wine, allergenState: 'RECORDED', allergenNotes: 'Contains sulphites' })
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })
    await openTill(venueId)

    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue
    expect(listed.products.find(product => product.id === productId)).toMatchObject({
      allergenState: 'RECORDED',
      allergenNote: `${wine}: Contains sulphites.`,
    })
  })

  // Issue 1297: before the bar's first count, a drink pouring stock with nothing on hand is refused
  // at the charge, so the till tells whoever can count it how many drinks that is (0080).
  test('before the first count, the Bar Manager is told how many drinks the till would refuse', async () => {
    const { venueId } = programme('sale-uncounted')
    const { productId, variantId } = await aSellableProduct({ name: named('Uncounted gin') })
    const itemId = await anItem({ name: named('Uncounted base') })
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })
    await openTill(venueId)

    const listed = await catalogue(venueId).then(response => response.json()) as ListedCatalogue & { stockCounted?: boolean }
    expect(listed.stockCounted).toBe(false)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, barManager.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    await waitFor(view, `document.querySelector('[data-test="till-uncounted"]')`)
    expect(await textOf(view, '[data-test="till-uncounted"]')).toContain('nothing on hand')
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="till-uncounted"] a[href="/bar/stock/stocktakes"]')`)).toBe(true)
    view.close()
  }, 120_000)

  // A shift cannot reach the stocktake screen, so it has nothing to do about the warning.
  test('before the first count, a bar shift without the stock screen is not shown it', async () => {
    const { venueId, performanceId } = programme('sale-uncounted-shift')
    const { productId, variantId } = await aSellableProduct({ name: named('Uncounted rum') })
    const itemId = await anItem({ name: named('Uncounted rum base') })
    await send('PUT', `/api/admin/bar/variants/${variantId}/components`, { components: [{ itemId, qty: 25 }] })
    await openTill(venueId)

    const shiftPassword = generatePassword()
    const shift = await registerMember(app, 'sale-uncounted-shift', shiftPassword)
    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(`${performanceId}-BAR`, performanceId, 'BAR', 1, shift.id, 'CONFIRMED')
    }
    finally {
      database.close()
    }

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', shift.email)
    await fill(view, 'form input[type="password"]', shiftPassword)
    await click(view, 'form button[type="submit"]')
    await finishSignIn(app, view, shift.email)

    await visit(view, `${app.baseURL}/tonight/till?venueId=${venueId}`, `[data-test="product-${productId}"]`)
    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="till-uncounted"]')`)).toBe(false)
    view.close()
  }, 120_000)
})

// The choice modal's option buttons are keyed by the option row's own id, read back from the
// choice group so the screen test can click the one it just created.
async function optionIdFor(groupId: string, itemId: string): Promise<string> {
  const answered = await send('GET', '/api/admin/bar/choice-groups')
  const body = await answered.json() as { groups: { id: string, options: { id: string, itemId: string }[] }[] }
  const group = body.groups.find(entry => entry.id === groupId)
  return group?.options.find(option => option.itemId === itemId)?.id ?? ''
}

async function lineIdFrom(view: Bun.WebView): Promise<string> {
  const attribute = await view.evaluate<string>(`document.querySelector('[data-test="basket"] [data-test^="line-"]').getAttribute('data-test')`)
  return attribute.replace('line-', '')
}
