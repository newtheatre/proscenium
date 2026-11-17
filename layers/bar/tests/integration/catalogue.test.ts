// The bar's catalogue (BAR-01 to BAR-04; tests T-I1 to T-I3): categories, products and sizes, prices
// that are never edited, price lists by hand or as a percentage off Standard, and outlets with one
// desk at most. Standard is made when the bar is switched on.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import catalogueGet from '../../server/api/bar/catalogue.get'
import categoriesPost from '../../server/api/bar/categories/index.post'
import categoryPatch from '../../server/api/bar/categories/[id].patch'
import productsPost from '../../server/api/bar/products/index.post'
import productGet from '../../server/api/bar/products/[id]/index.get'
import productPatch from '../../server/api/bar/products/[id]/index.patch'
import productMove from '../../server/api/bar/products/[id]/move.post'
import variantsPost from '../../server/api/bar/products/[id]/variants.post'
import variantPatch from '../../server/api/bar/variants/[id].patch'
import pricesPost from '../../server/api/bar/prices.post'
import listsGet from '../../server/api/bar/price-lists/index.get'
import listsPost from '../../server/api/bar/price-lists/index.post'
import listPatch from '../../server/api/bar/price-lists/[id]/index.patch'
import listRaise from '../../server/api/bar/price-lists/[id]/raise.post'
import outletsGet from '../../server/api/bar/outlets/index.get'
import outletsPost from '../../server/api/bar/outlets/index.post'
import outletPatch from '../../server/api/bar/outlets/[id]/index.patch'
import standardListener from '../../server/listeners/standard-price-list'
import { menu } from '../../server/catalogue'

const handle = server({
  'GET /api/bar/catalogue': catalogueGet,
  'POST /api/bar/categories': categoriesPost,
  'PATCH /api/bar/categories/:id': categoryPatch,
  'POST /api/bar/products': productsPost,
  'GET /api/bar/products/:id': productGet,
  'PATCH /api/bar/products/:id': productPatch,
  'POST /api/bar/products/:id/move': productMove,
  'POST /api/bar/products/:id/variants': variantsPost,
  'PATCH /api/bar/variants/:id': variantPatch,
  'POST /api/bar/prices': pricesPost,
  'GET /api/bar/price-lists': listsGet,
  'POST /api/bar/price-lists': listsPost,
  'PATCH /api/bar/price-lists/:id': listPatch,
  'POST /api/bar/price-lists/:id/raise': listRaise,
  'GET /api/bar/outlets': outletsGet,
  'POST /api/bar/outlets': outletsPost,
  'PATCH /api/bar/outlets/:id': outletPatch,
})

const NOW = Date.UTC(2026, 10, 17, 18) // not-policy: a test's moment
const manager = person(['bar.product.manage', 'bar.price.manage', 'bar.outlet.manage'], { reassertedAt: NOW })
const stocker = person(['bar.product.manage'])

async function bar<T = any>(method: string, path: string, body?: unknown, actor = manager): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}
const ok = <T>(r: { status: number, body: T }) => {
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const standard = async () => (await rows<{ id: string }>("SELECT id FROM bar_price_lists WHERE system_key = 'standard'"))[0]!.id

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await inContext(async () => {
    const unit = createUnit()
    await standardListener({ payload: { moduleId: 'bar' } } as any, unit.view())
    await standardListener({ payload: { moduleId: 'bar' } } as any, unit.view())
    await unit.commit()
  })
})

describe('the catalogue', () => {
  it('makes Standard once, and keeps it in use with prices of its own', async () => {
    expect(await rows("SELECT name FROM bar_price_lists WHERE system_key = 'standard'")).toEqual([{ name: 'Standard' }])
    const id = await standard()
    expect((await bar('PATCH', `/api/bar/price-lists/${id}`, { active: false })).body.code).toBe('bar.price-list.standard')
    expect((await bar('PATCH', `/api/bar/price-lists/${id}`, { percentOff: 10 })).body.code).toBe('bar.price-list.standard')
  })

  it('adds categories, products with a first size, and more sizes; names are unique where they should be', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Draught', colour: 'warning' }))
    expect((await bar('POST', '/api/bar/categories', { name: 'draught' })).body.code).toBe('bar.name-taken')
    const lager = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'House lager', ageRestricted: true, variantName: 'Pint', amountMinor: 450 }))
    ok(await bar('POST', `/api/bar/products/${lager.productId}/variants`, { name: 'Half', amountMinor: 230 }))
    expect((await bar('POST', `/api/bar/products/${lager.productId}/variants`, { name: 'pint' })).body.code).toBe('bar.name-taken')
    const crisps = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Crisps' }))
    expect(await rows('SELECT name FROM bar_variants WHERE product_id = ?', crisps.productId)).toEqual([{ name: 'Each' }])

    const read = ok(await bar('GET', `/api/bar/products/${lager.productId}`, undefined, stocker))
    expect(read.canPrice).toBe(false)
    expect(read.product.variants.map((v: any) => [v.name, v.prices[0].amountMinor])).toEqual([['Pint', 450], ['Half', 230]])
    // Someone who sets up products without pricing them adds a size, and its price is left to others.
    expect((await bar('POST', '/api/bar/prices', { variantId: lager.variantId, priceListId: null, amountMinor: 1 }, stocker)).status).toBe(403)
  })

  it('reorders products by keyboard, and keeps a product on sale with at least one size', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Snacks' }))
    const a = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Apple' }))
    const b = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Banana' }))
    ok(await bar('POST', `/api/bar/products/${b.productId}/move`, { direction: 'up' }))
    expect((await rows<{ name: string }>('SELECT name FROM bar_products WHERE category_id = ? ORDER BY position', categoryId)).map(r => r.name)).toEqual(['Banana', 'Apple'])
    expect((await bar('PATCH', `/api/bar/variants/${a.variantId}`, { active: false })).body.code).toBe('bar.variant.last')
    ok(await bar('PATCH', `/api/bar/products/${a.productId}`, { active: false }))
    ok(await bar('PATCH', `/api/bar/variants/${a.variantId}`, { active: false }))
    ok(await bar('PATCH', `/api/bar/categories/${categoryId}`, { active: false }))
    expect((await bar('POST', '/api/bar/products', { categoryId, name: 'Cherry' })).body.code).toBe('bar.category.unknown')
  })
})

describe('prices and price lists', () => {
  it('raises a list\'s prices together, previewing old and new before writing (BAR-04)', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Raise spirits' }))
    const gin = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Raise gin', variantName: 'Single', amountMinor: 333 }))
    const rum = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Raise rum', variantName: 'Single', amountMinor: 400 }))
    const list = await standard()
    expect((await bar('POST', `/api/bar/price-lists/${list}/raise`, { categoryIds: [categoryId], preview: true })).body).toMatchObject({ code: 'bar.price.raise-how' })
    const shown = ok(await bar('POST', `/api/bar/price-lists/${list}/raise`, { categoryIds: [categoryId], percent: 10, preview: true }))
    expect(shown.rows).toEqual(expect.arrayContaining([{ variantId: gin.variantId, oldMinor: 333, newMinor: 366 }, { variantId: rum.variantId, oldMinor: 400, newMinor: 440 }]))
    expect(shown.rows.length).toBe(2)
    expect(await rows('SELECT count(*) AS n FROM bar_prices WHERE variant_id IN (?, ?)', gin.variantId, rum.variantId)).toEqual([{ n: 2 }])
    ok(await bar('POST', `/api/bar/price-lists/${list}/raise`, { categoryIds: [categoryId], amountMinor: 50, preview: false }))
    expect(await rows('SELECT amount_minor FROM bar_prices WHERE variant_id = ? ORDER BY created_at, id', rum.variantId)).toEqual([{ amount_minor: 400 }, { amount_minor: 450 }])
    expect((await bar('POST', `/api/bar/price-lists/${list}/raise`, { percent: 5, preview: true }, stocker)).status).toBe(403)
  })

  it('writes a new price row for each change, takes a future price at its time, and never edits the old one', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Wine' }))
    const red = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'House red', variantName: '175 ml', amountMinor: 500 }))
    const at = NOW
    ok(await bar('POST', '/api/bar/prices', { variantId: red.variantId, priceListId: null, amountMinor: 550, effectiveFrom: at + 3_600_000 }))
    expect(await rows('SELECT amount_minor FROM bar_prices WHERE variant_id = ? ORDER BY effective_from', red.variantId)).toEqual([{ amount_minor: 500 }, { amount_minor: 550 }])
    const now = ok(await bar('GET', `/api/bar/products/${red.productId}`)).product.variants[0].prices[0]
    expect(now).toMatchObject({ amountMinor: 500, next: { amountMinor: 550 } })
    await expect(env.DB.prepare('UPDATE bar_prices SET amount_minor = 1 WHERE variant_id = ?').bind(red.variantId).run()).rejects.toThrow(/append-only/)
    setClock(at + 2 * 3_600_000)
    expect(ok(await bar('GET', `/api/bar/products/${red.productId}`)).product.variants[0].prices[0].amountMinor).toBe(550)
    setClock(NOW)
  })

  it('prices a hand-priced list, falling back to Standard, and a percentage list from Standard', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Cider' }))
    const cider = ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Cider', variantName: 'Pint', amountMinor: 450 }))
    const staff = ok(await bar('POST', '/api/bar/price-lists', { name: 'Staff', restricted: true })).priceListId
    const committee = ok(await bar('POST', '/api/bar/price-lists', { name: 'Committee', percentOff: 25 })).priceListId
    expect((await bar('POST', '/api/bar/price-lists', { name: 'staff' })).body.code).toBe('bar.name-taken')

    const prices = async () => {
      const lists = ok(await bar('GET', '/api/bar/price-lists')).categories.flatMap((c: any) => c.products).find((p: any) => p.id === cider.productId).variants[0].prices
      return Object.fromEntries(lists.filter((p: any) => [staff, committee].includes(p.listId)).map((p: any) => [p.listId === staff ? 'staff' : 'committee', [p.amountMinor, p.from]]))
    }
    expect(await prices()).toEqual({ staff: [450, 'standard'], committee: [338, 'percent'] })
    ok(await bar('POST', '/api/bar/prices', { variantId: cider.variantId, priceListId: staff, amountMinor: 300 }))
    ok(await bar('POST', '/api/bar/prices', { variantId: cider.variantId, priceListId: null, amountMinor: 500 }))
    expect(await prices()).toEqual({ staff: [300, 'list'], committee: [375, 'percent'] })

    expect((await bar('POST', '/api/bar/prices', { variantId: cider.variantId, priceListId: committee, amountMinor: 100 })).body.code).toBe('bar.price.not-settable')
    expect((await bar('PATCH', `/api/bar/price-lists/${staff}`, { percentOff: 10 })).body.code).toBe('bar.price-list.has-prices')
    // Withdrawn on Staff: it sells at Standard's price again.
    ok(await bar('POST', '/api/bar/prices', { variantId: cider.variantId, priceListId: staff, amountMinor: null }))
    expect(await prices()).toEqual({ staff: [500, 'standard'], committee: [375, 'percent'] })
  })
})

describe('outlets', () => {
  it('adds outlets on Standard unless told otherwise, with one desk at most, and retires them', async () => {
    const foyer = ok(await bar('POST', '/api/bar/outlets', { name: 'Foyer bar', kind: 'bar' })).outletId
    expect((await bar('POST', '/api/bar/outlets', { name: 'foyer bar', kind: 'kiosk' })).body.code).toBe('bar.outlet.refused')
    const desk = ok(await bar('POST', '/api/bar/outlets', { name: 'Box office', kind: 'desk' })).outletId
    expect((await bar('POST', '/api/bar/outlets', { name: 'Second desk', kind: 'desk' })).body.code).toBe('bar.outlet.refused')
    expect((await bar('PATCH', `/api/bar/outlets/${foyer}`, { kind: 'desk' })).body.code).toBe('bar.outlet.refused')
    const list = ok(await bar('GET', '/api/bar/outlets'))
    expect(list.outlets.find((o: any) => o.id === foyer)).toMatchObject({ kind: 'bar', priceList: 'Standard', active: true })

    ok(await bar('PATCH', `/api/bar/outlets/${desk}`, { active: false }))
    ok(await bar('POST', '/api/bar/outlets', { name: 'New desk', kind: 'desk' }))

    const retired = ok(await bar('POST', '/api/bar/price-lists', { name: 'Interval' })).priceListId
    ok(await bar('PATCH', `/api/bar/outlets/${foyer}`, { priceListId: retired }))
    expect((await bar('PATCH', `/api/bar/price-lists/${retired}`, { active: false })).body.code).toBe('bar.price-list.in-use')
  })

  it('offers an outlet the products with a price on its list', async () => {
    const { categoryId } = ok(await bar('POST', '/api/bar/categories', { name: 'Merchandise' }))
    ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Programme', amountMinor: 300 }))
    ok(await bar('POST', '/api/bar/products', { categoryId, name: 'Tote bag' }))
    const kiosk = ok(await bar('POST', '/api/bar/outlets', { name: 'Kiosk', kind: 'kiosk' })).outletId
    const shown = await inContext(() => menu(kiosk))
    const merch = shown.categories.find(c => c.name === 'Merchandise')!
    expect(merch.items.map(i => [i.product, i.variant, i.amountMinor])).toEqual([['Programme', 'Each', 300]])
  })
})
