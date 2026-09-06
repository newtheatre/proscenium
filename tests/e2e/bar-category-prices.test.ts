import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-121 through the real routes and the real screen: a category's own default resolves only when
// a variant has no price of its own, and the catalogue shows which level answered.

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
  member = await registerMember(app, 'ordinary', generatePassword())

  barManager = await registerMember(app, 'catprices', barPassword)
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

const today = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

const dayFrom = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })

interface ListedVariant {
  id: string
  servingKind: string
  label: string
  pricePence: number | null
  priceSource: 'variant' | 'category' | null
}

interface ListedCategoryPrice {
  id: string
  servingKind: string
  pricePence: number
  effectiveFrom: string
  effective: boolean
}

async function aCategory(): Promise<string> {
  return created(await send('POST', '/api/admin/bar/categories', { name: named('Spirits') }))
}

const aProductIn = async (categoryId: string): Promise<string> =>
  created(await send('POST', '/api/admin/bar/products', { name: named('Gin'), categoryId }))

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'single', label: 'Single', ...over }))

async function variants(productId: string): Promise<ListedVariant[]> {
  const answered = await send('GET', `/api/admin/bar/products/${productId}/variants`)
  expect(answered.status).toBe(200)
  return (await answered.json() as { variants: ListedVariant[] }).variants
}

async function categoryPrices(categoryId: string): Promise<ListedCategoryPrice[]> {
  const answered = await send('GET', `/api/admin/bar/categories/${categoryId}/prices`)
  expect(answered.status).toBe(200)
  return (await answered.json() as { prices: ListedCategoryPrice[] }).prices
}

const setCategoryDefault = (categoryId: string, over: Record<string, unknown> = {}): Promise<Response> =>
  send('POST', `/api/admin/bar/categories/${categoryId}/prices`, { servingKind: 'single', pricePence: 250, effectiveFrom: today(), ...over })

const setVariantPrice = (variantId: string, over: Record<string, unknown> = {}): Promise<Response> =>
  send('POST', `/api/admin/bar/variants/${variantId}/prices`, { pricePence: 300, effectiveFrom: today(), ...over })

const resolved = async (productId: string, variantId: string): Promise<ListedVariant | undefined> =>
  (await variants(productId)).find(variant => variant.id === variantId)

describe.skipIf(skip !== null)('resolution is variant price first, category default second (F-121 criterion 2)', () => {
  test('a variant with no price of its own falls back to the category default', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)

    expect((await setCategoryDefault(categoryId, { pricePence: 250 })).status).toBe(200)

    const variant = await resolved(productId, variantId)
    expect(variant?.pricePence).toBe(250)
    expect(variant?.priceSource).toBe('category')
  })

  test('an explicit variant price always beats the category default', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)

    await setCategoryDefault(categoryId, { pricePence: 250 })
    await setVariantPrice(variantId, { pricePence: 300 })

    const variant = await resolved(productId, variantId)
    expect(variant?.pricePence).toBe(300)
    expect(variant?.priceSource).toBe('variant')
  })

  test('a variant with neither refuses to sell rather than guessing', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)

    const variant = await resolved(productId, variantId)
    expect(variant?.pricePence).toBeNull()
    expect(variant?.priceSource).toBeNull()
  })

  // A category shared by several products means the default follows the category, not one product.
  test('the same category default prices every product sharing the category', async () => {
    const categoryId = await aCategory()
    await setCategoryDefault(categoryId, { pricePence: 400 })

    const firstProduct = await aProductIn(categoryId)
    const firstVariant = await addVariant(firstProduct)
    const secondProduct = await aProductIn(categoryId)
    const secondVariant = await addVariant(secondProduct, { servingKind: 'single', label: 'Single' })

    expect((await resolved(firstProduct, firstVariant))?.pricePence).toBe(400)
    expect((await resolved(secondProduct, secondVariant))?.pricePence).toBe(400)
  })

  test('single and double resolve independently, each against its own default', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const single = await addVariant(productId, { servingKind: 'single', label: 'Single' })
    const double = await addVariant(productId, { servingKind: 'double', label: 'Double' })

    await setCategoryDefault(categoryId, { servingKind: 'single', pricePence: 250 })
    await setCategoryDefault(categoryId, { servingKind: 'double', pricePence: 400 })

    expect((await resolved(productId, single))?.pricePence).toBe(250)
    expect((await resolved(productId, double))?.pricePence).toBe(400)
  })
})

describe.skipIf(skip !== null)('a category default is a dated append-only row (F-121 criterion 1)', () => {
  test('the latest row on or before today wins, and a future one waits', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId)

    await setCategoryDefault(categoryId, { pricePence: 250, effectiveFrom: dayFrom(-7) })
    expect((await resolved(productId, variantId))?.pricePence).toBe(250)

    const later = await setCategoryDefault(categoryId, { pricePence: 300, effectiveFrom: dayFrom(7) })
    expect((await later.json() as { effectiveNow: boolean }).effectiveNow).toBe(false)
    expect((await resolved(productId, variantId))?.pricePence).toBe(250)

    const history = await categoryPrices(categoryId)
    expect(history.map(row => row.pricePence)).toEqual([300, 250])
    expect(history.find(row => row.effective)?.pricePence).toBe(250)
  })

  test('a same-day mistake is corrected today, by a new row rather than an edit', async () => {
    const categoryId = await aCategory()
    await setCategoryDefault(categoryId, { pricePence: 250, effectiveFrom: today() })
    await setCategoryDefault(categoryId, { pricePence: 25, effectiveFrom: today() })
    await setCategoryDefault(categoryId, { pricePence: 250, effectiveFrom: today() })

    const history = await categoryPrices(categoryId)
    expect(history).toHaveLength(3)
    expect(history.filter(row => row.effective)).toHaveLength(1)
    expect(history.find(row => row.effective)?.pricePence).toBe(250)
  })

  test('pounds typed into a field that takes pence are refused', async () => {
    const categoryId = await aCategory()
    expect((await setCategoryDefault(categoryId, { pricePence: 18.5 })).status).toBe(400)
    expect((await setCategoryDefault(categoryId, { pricePence: -100 })).status).toBe(400)
  })

  test('an effective date is a civil date, not anything else somebody typed', async () => {
    const categoryId = await aCategory()
    expect((await setCategoryDefault(categoryId, { effectiveFrom: '14/09/2026' })).status).toBe(400)
  })

  test('a serving kind outside the vocabulary is refused', async () => {
    const categoryId = await aCategory()
    expect((await setCategoryDefault(categoryId, { servingKind: 'firkin' })).status).toBe(400)
  })

  test('a category that does not exist is refused', async () => {
    expect((await setCategoryDefault('no-such-category')).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('who may administer category defaults', () => {
  test('the bar manager may, and an ordinary member may not', async () => {
    const categoryId = await aCategory()
    expect((await send('GET', `/api/admin/bar/categories/${categoryId}/prices`, undefined, barManager.cookie)).status).toBe(200)
    expect((await send('GET', `/api/admin/bar/categories/${categoryId}/prices`, undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', `/api/admin/bar/categories/${categoryId}/prices`,
      { servingKind: 'single', pricePence: 250, effectiveFrom: today() }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the catalogue screen', () => {
  test('shows which level answered, and a stray variant override is visible against it', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId, { servingKind: 'single', label: 'Single' })
    await setCategoryDefault(categoryId, { servingKind: 'single', pricePence: 250 })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/products/${productId}`, `[data-test="price-source-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="price-source-${variantId}"]')`)
    expect(await textOf(view, `[data-test="price-source-${variantId}"]`)).toContain('Category default')

    await setVariantPrice(variantId, { pricePence: 300 })
    await visit(view, `${app.baseURL}/bar/products/${productId}`, `[data-test="price-source-${variantId}"]`)
    await waitFor(view, `document.querySelector('[data-test="price-source-${variantId}"]') && document.querySelector('[data-test="price-source-${variantId}"]').textContent.includes('Own price')`)
    expect(await textOf(view, `[data-test="price-source-${variantId}"]`)).toContain('Own price')
    view.close()
  }, 120_000)

  test('a default set through the category screen reaches a variant with no price of its own', async () => {
    const categoryId = await aCategory()
    const productId = await aProductIn(categoryId)
    const variantId = await addVariant(productId, { servingKind: 'single', label: 'Single' })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/categories`, `[data-test="prices-${categoryId}"]`)
    await click(view, `[data-test="prices-${categoryId}"]`)
    await waitFor(view, `document.querySelector('[data-test="category-price-form"]')`)
    await fillNumber(view, '[data-test="category-price-amount"]', '2.50')
    await click(view, '[data-test="category-price-submit"]')
    await waitFor(view, `document.querySelector('[data-test="category-price-history"]') && document.querySelector('[data-test="category-price-history"]').textContent.includes('£2.50')`)
    view.close()

    const variant = await resolved(productId, variantId)
    expect(variant?.pricePence).toBe(250)
    expect(variant?.priceSource).toBe('category')
  }, 120_000)
})
