import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillNumber, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-112 and F-116 through the real routes and the real screen. One stocked bottle sells four ways,
// and what each way costs is a dated series nothing overwrites.

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

  barManager = await registerMember(app, 'sizes', barPassword)
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
  status: string
  pricePence: number | null
  everSold: boolean
  components: { itemId: string | null, itemName: string | null, qty: number }[]
}

interface ListedPrice {
  id: string
  pricePence: number
  effectiveFrom: string
  effective: boolean
}

async function aProduct(): Promise<string> {
  const categoryId = await created(await send('POST', '/api/admin/bar/categories', { name: named('Wine') }))
  return created(await send('POST', '/api/admin/bar/products', { name: named('House red'), categoryId }))
}

const anItem = async (over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/items', { name: named('Bottle'), unit: 'ML', containerMl: 750, ...over }))

const addVariant = async (productId: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'bottle', label: 'Bottle', ...over }))

async function variants(productId: string, as = officer.cookie): Promise<ListedVariant[]> {
  const answered = await send('GET', `/api/admin/bar/products/${productId}/variants`, undefined, as)
  expect(answered.status).toBe(200)
  return (await answered.json() as { variants: ListedVariant[] }).variants
}

async function prices(variantId: string): Promise<ListedPrice[]> {
  const answered = await send('GET', `/api/admin/bar/variants/${variantId}/prices`)
  expect(answered.status).toBe(200)
  return (await answered.json() as { prices: ListedPrice[] }).prices
}

const priceOf = async (productId: string, variantId: string): Promise<number | null> =>
  (await variants(productId)).find(variant => variant.id === variantId)?.pricePence ?? null

function auditCount(action: string, target: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT count(*) AS total FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { total: number }
    return row.total
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('one stocked thing sells at many sizes (F-112 criteria 1, 2 and 4)', () => {
  test('a bottle sells four ways, each depleting the same stocked item differently', async () => {
    const productId = await aProduct()
    const itemId = await anItem()

    for (const [kind, label, qty] of [
      ['bottle', 'Bottle', 750],
      ['125ml', 'Small glass', 125],
      ['175ml', 'Standard glass', 175],
      ['250ml', 'Large glass', 250],
    ] as const) {
      const id = await addVariant(productId, { servingKind: kind, label })
      expect((await send('PUT', `/api/admin/bar/variants/${id}/components`, {
        components: [{ itemId, qty }],
      })).status).toBe(200)
    }

    const listed = await variants(productId)
    expect(listed.map(variant => variant.components[0]?.qty).sort((a, b) => (a ?? 0) - (b ?? 0)))
      .toEqual([125, 175, 250, 750])
    expect(listed.every(variant => variant.components[0]?.itemId === itemId)).toBe(true)
  })

  // Twice the depletion at nothing like twice the price is exactly what variants are for (0017).
  test('depletion is independent of price', async () => {
    const productId = await aProduct()
    const itemId = await anItem({ name: named('Gin') })
    const single = await addVariant(productId, { servingKind: 'single', label: 'Single' })
    const double = await addVariant(productId, { servingKind: 'double', label: 'Double' })

    await send('PUT', `/api/admin/bar/variants/${single}/components`, { components: [{ itemId, qty: 25 }] })
    await send('PUT', `/api/admin/bar/variants/${double}/components`, { components: [{ itemId, qty: 50 }] })
    await send('POST', `/api/admin/bar/variants/${single}/prices`, { pricePence: 350, effectiveFrom: today() })
    await send('POST', `/api/admin/bar/variants/${double}/prices`, { pricePence: 500, effectiveFrom: today() })

    const listed = await variants(productId)
    const one = listed.find(variant => variant.id === single)
    const two = listed.find(variant => variant.id === double)
    expect(two?.components[0]?.qty).toBe(2 * (one?.components[0]?.qty ?? 0))
    expect(two?.pricePence).not.toBe(2 * (one?.pricePence ?? 0))
  })

  test('a product holds each serving kind once, and the refusal says which', async () => {
    const productId = await aProduct()
    await addVariant(productId)

    const again = await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'bottle', label: 'Bottle again' })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain('bottle')
  })

  test('a serving kind nobody defined is refused', async () => {
    const productId = await aProduct()
    expect((await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'schooner', label: 'Schooner' })).status).toBe(400)
  })

  test('a depletion is validated positive and against a stocked item that exists', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    const itemId = await anItem()

    expect((await send('PUT', `/api/admin/bar/variants/${id}/components`, { components: [{ itemId, qty: 0 }] })).status).toBe(400)
    expect((await send('PUT', `/api/admin/bar/variants/${id}/components`, { components: [{ itemId, qty: -175 }] })).status).toBe(400)
    expect((await send('PUT', `/api/admin/bar/variants/${id}/components`, { components: [{ itemId: 'nowhere', qty: 175 }] })).status).toBe(404)
  })

  test('nothing can be poured from a retired stocked item', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    const itemId = await anItem()
    await send('POST', `/api/admin/bar/items/${itemId}/status`, { status: 'RETIRED' })

    const refused = await send('PUT', `/api/admin/bar/variants/${id}/components`, { components: [{ itemId, qty: 175 }] })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('retired')
  })

  test('a product with no serving size cannot go on the till, and one with a size can', async () => {
    const productId = await aProduct()
    const refused = await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('a serving size')

    await addVariant(productId)
    expect((await send('POST', `/api/admin/bar/products/${productId}/status`, { status: 'ACTIVE' })).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('a size is retired, never destroyed (F-112 criterion 5)', () => {
  test('retiring hides it and touches nothing behind it', async () => {
    const productId = await aProduct()
    const itemId = await anItem()
    const id = await addVariant(productId)
    await send('PUT', `/api/admin/bar/variants/${id}/components`, { components: [{ itemId, qty: 750 }] })
    await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: today() })

    expect((await send('POST', `/api/admin/bar/variants/${id}/status`, { status: 'RETIRED' })).status).toBe(200)

    const listed = (await variants(productId)).find(variant => variant.id === id)
    expect(listed?.status).toBe('RETIRED')
    expect(listed?.components).toHaveLength(1)
    expect(await prices(id)).toHaveLength(1)
  })

  test('a size with a price history can only be retired, and the refusal says so', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: today() })

    const refused = await send('DELETE', `/api/admin/bar/variants/${id}`)
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('append-only')
  })

  test('a size nothing priced and nothing sold is deleted outright', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    expect((await send('DELETE', `/api/admin/bar/variants/${id}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/bar/variants/${id}`)).status).toBe(404)
  })

  // The status write batches a conditional UPDATE with an audit insert that reads `changes()`,
  // the row count of that same UPDATE, so a losing race writes neither (0001, 0003).
  test('two people retiring the same size at once write one audit entry between them', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)

    const raced = await Promise.all([
      send('POST', `/api/admin/bar/variants/${id}/status`, { status: 'RETIRED' }),
      send('POST', `/api/admin/bar/variants/${id}/status`, { status: 'RETIRED' }, barManager.cookie),
    ])

    expect(raced.filter(answered => answered.status === 200).length).toBe(1)
    expect((await variants(productId)).find(variant => variant.id === id)?.status).toBe('RETIRED')
    expect(auditCount('bar.variant.status.changed', `bar-variant:${id}`)).toBe(1)
  })

  test('a size does not move between products', async () => {
    const productId = await aProduct()
    const elsewhere = await aProduct()
    const id = await addVariant(productId)

    await send('PUT', `/api/admin/bar/variants/${id}`, { productId: elsewhere, servingKind: 'bottle', label: 'Moved' })
    expect((await variants(elsewhere)).map(variant => variant.id)).not.toContain(id)
    expect((await variants(productId)).find(variant => variant.id === id)?.label).toBe('Moved')
  })
})

describe.skipIf(skip !== null)('a price is a dated append-only row (F-116)', () => {
  test('the latest row on or before today wins, and a future one waits', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)

    await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: dayFrom(-7) })
    expect(await priceOf(productId, id)).toBe(1800)

    const later = await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1900, effectiveFrom: dayFrom(7) })
    expect((await later.json() as { effectiveNow: boolean }).effectiveNow).toBe(false)
    expect(await priceOf(productId, id)).toBe(1800)

    const history = await prices(id)
    expect(history.map(row => row.pricePence)).toEqual([1900, 1800])
    expect(history.find(row => row.effective)?.pricePence).toBe(1800)
  })

  // The old estate held one row per product per day, so a same-day mistake waited for tomorrow.
  test('a same-day mistake is corrected today, by a new row rather than an edit', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)

    await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: today() })
    const wrong = await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 180, effectiveFrom: today() })
    expect((await wrong.json() as { effectiveNow: boolean }).effectiveNow).toBe(true)
    expect(await priceOf(productId, id)).toBe(180)

    await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: today() })
    expect(await priceOf(productId, id)).toBe(1800)

    // Three rows, all of them still there: nothing was overwritten to get back to the right one.
    const history = await prices(id)
    expect(history).toHaveLength(3)
    expect(history.filter(row => row.effective)).toHaveLength(1)
  })

  test('a size nothing has priced resolves to nothing rather than to nought', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    expect(await priceOf(productId, id)).toBeNull()
    expect(await prices(id)).toEqual([])
  })

  test('pounds typed into a field that takes pence are refused', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    expect((await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 18.5, effectiveFrom: today() })).status).toBe(400)
    expect((await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: -100, effectiveFrom: today() })).status).toBe(400)
  })

  test('an effective date is a civil date, not anything else somebody typed', async () => {
    const productId = await aProduct()
    const id = await addVariant(productId)
    expect((await send('POST', `/api/admin/bar/variants/${id}/prices`, { pricePence: 1800, effectiveFrom: '14/09/2026' })).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('who may administer the sizes', () => {
  test('the bar manager may, and an ordinary member may not', async () => {
    const productId = await aProduct()
    expect((await send('GET', `/api/admin/bar/products/${productId}/variants`, undefined, barManager.cookie)).status).toBe(200)
    expect((await send('GET', `/api/admin/bar/products/${productId}/variants`, undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/bar/variants', { productId, servingKind: 'bottle', label: 'Sneaked' }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  // A form validates its whole state, so a modal held to the wrong schema throws before the
  // handler runs and the button silently does nothing. Only driving it proves it works.
  test('a size added and priced through the screen reaches the list', async () => {
    const productId = await aProduct()
    await anItem({ name: named('Screen bottle') })

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', barManager.email)
    await fill(view, 'form input[type="password"]', barPassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/bar/products/${productId}`, '[data-test="add-variant"]')
    await click(view, '[data-test="add-variant"]')
    await waitFor(view, `document.querySelector('[data-test="variant-form"]')`)
    await fill(view, '[data-test="variant-label"]', 'Standard glass')
    await click(view, '[data-test="variant-submit"]')
    await waitFor(view, `!document.querySelector('[data-test="variant-form"]')`)

    const listed = await variants(productId)
    expect(listed.map(variant => variant.label)).toContain('Standard glass')

    const id = listed.find(variant => variant.label === 'Standard glass')!.id
    await click(view, `[data-test="prices-${id}"]`)
    await waitFor(view, `document.querySelector('[data-test="price-form"]')`)
    await fillNumber(view, '[data-test="price-amount"]', '6.50')
    await click(view, '[data-test="price-submit"]')
    await waitFor(view, `document.querySelector('[data-test="price-history"]') && document.querySelector('[data-test="price-history"]').textContent.includes('£6.50')`)

    expect(await priceOf(productId, id)).toBe(650)
    expect(await textOf(view, '[data-test="price-history"]')).toContain('In force today')
    view.close()
  }, 120_000)
})
