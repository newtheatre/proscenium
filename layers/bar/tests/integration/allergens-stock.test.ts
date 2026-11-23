// Allergens, build step 2: recorded on stock items, and worked out for every size made from them. A
// size is checked only when every item its recipe names is; an option with a stock item answers with
// the item's; a product with no recipe keeps its own answer.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import menuGet from '../../server/api/bar/till/menu.get'
import itemAllergensPost from '../../server/api/bar/stock/items/[id]/allergens.post'
import itemAllergensGet from '../../server/api/bar/stock/items/[id]/allergens.get'
import productAllergensPost from '../../server/api/bar/products/[id]/allergens.post'
import productAllergensGet from '../../server/api/bar/products/[id]/allergens.get'
import chartGet from '../../server/api/bar/allergens/chart.get'
import uncheckedGet from '../../server/api/bar/allergens/unchecked.get'
import uncheckedCount from '../../server/contributions/core.count/allergens-unchecked'
import { labelsDue } from '../../server/allergen-chart'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'
import { addGroup, addOption, setProductGroups } from '../../server/choices'
import { addStockItem, setRecipe } from '../../server/stock'

const NOW = Date.UTC(2026, 10, 18, 2) // not-policy: a test's moment
const handle = server({
  'GET /api/bar/till/menu': menuGet,
  'POST /api/bar/stock/items/:id/allergens': itemAllergensPost,
  'GET /api/bar/stock/items/:id/allergens': itemAllergensGet,
  'POST /api/bar/products/:id/allergens': productAllergensPost,
  'GET /api/bar/products/:id/allergens': productAllergensGet,
  'GET /api/bar/allergens/chart': chartGet,
  'GET /api/bar/allergens/unchecked': uncheckedGet,
})
const manager = person(['bar.sale.sell', 'bar.allergens.manage'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T> | T): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function send(method: string, path: string, body?: unknown) {
  const response = await call(handle, method, path, { actor: manager, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

const s = { outlet: '', jug: '', jugProduct: '', crisps: '', crispsProduct: '', milkGroup: '', oat: '', pimms: '', lemonade: '', oatItem: '' }
const menu = async () => (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body
const item = (m: any, variantId: string) => m.categories.flatMap((c: any) => c.items).find((i: any) => i.variantId === variantId)
const option = (m: any, groupId: string, key: string) => m.groups.find((g: any) => g.id === groupId).options.find((o: any) => o.key === key)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    const drinks = addCategory(v, { name: 'Stock allergen drinks' })
    const jug = await addProduct(v, { categoryId: drinks, name: 'Stock allergen jug' }, { amountMinor: 1500 }, manager.accountId!)
    s.jug = jug.variantId
    s.jugProduct = jug.productId
    const crisps = await addProduct(v, { categoryId: drinks, name: 'Stock allergen crisps' }, { amountMinor: 120 }, manager.accountId!)
    s.crisps = crisps.variantId
    s.crispsProduct = crisps.productId
    s.outlet = addOutlet(v, { name: 'Stock allergen bar', kind: 'bar' })
    s.pimms = await addStockItem(v, { name: 'Stock allergen fruit cup', baseUnit: 'ml', packSize: 700, packName: 'bottle', countUnitSize: 700 })
    s.lemonade = await addStockItem(v, { name: 'Stock allergen lemonade', baseUnit: 'ml', packSize: 2000, packName: 'bottle', countUnitSize: 2000 })
    s.oatItem = await addStockItem(v, { name: 'Stock allergen oat drink', baseUnit: 'ml', packSize: 1000, packName: 'carton', countUnitSize: 1000 })
  })
  await commit(async (unit) => {
    const v = unit.view()
    s.milkGroup = addGroup(v, { name: 'Stock allergen milk', source: 'options', required: false })
    s.oat = addOption(v, s.milkGroup, { name: 'Oat', stockItemId: s.oatItem })
    setProductGroups(v, s.jugProduct, [s.milkGroup])
    await setRecipe(v, s.jug, { lines: [{ stockItemId: s.pimms, quantity: 200 }, { stockItemId: s.lemonade, quantity: 600 }] })
  })
})

describe('a size made from stock', () => {
  it('is not checked while any of its items is not', async () => {
    expect((await send('POST', `/api/bar/stock/items/${s.pimms}/allergens`, { contains: [], mayContain: ['sulphites'] })).status).toBe(200)
    expect(item(await menu(), s.jug).allergens).toMatchObject({ checked: false })
  })

  it('answers with everything its items list once all are checked', async () => {
    expect((await send('POST', `/api/bar/stock/items/${s.lemonade}/allergens`, { contains: ['sulphites'], mayContain: ['celery'] })).status).toBe(200)
    // Sulphites are contained by one item, so they are not also "may contain".
    expect(item(await menu(), s.jug).allergens).toMatchObject({ contains: ['sulphites'], mayContain: ['celery'], checked: true })
    const read = (await send('GET', `/api/bar/products/${s.jugProduct}/allergens`)).body
    expect(read.sizes).toHaveLength(1)
    expect(read.sizes[0].items.map((i: any) => i.checked)).toEqual([true, true])
  })

  it('ignores what was recorded on the product itself', async () => {
    expect((await send('POST', `/api/bar/products/${s.jugProduct}/allergens`, { contains: ['peanuts'], mayContain: [] })).status).toBe(200)
    expect(item(await menu(), s.jug).allergens.contains).toEqual(['sulphites'])
  })

  it('drops an item\'s allergens when the item leaves the recipe', async () => {
    await commit(unit => setRecipe(unit.view(), s.jug, { lines: [{ stockItemId: s.pimms, quantity: 200 }] }))
    expect(item(await menu(), s.jug).allergens).toMatchObject({ contains: [], mayContain: ['sulphites'], checked: true })
  })

  it('keeps every check of a stock item', async () => {
    expect((await send('POST', `/api/bar/stock/items/${s.pimms}/allergens`, { contains: [], mayContain: ['sulphites'], source: 'supplier' })).status).toBe(200)
    const read = (await send('GET', `/api/bar/stock/items/${s.pimms}/allergens`)).body
    expect(read.history.map((h: any) => h.source)).toEqual(['supplier', 'label'])
    expect(await rows('SELECT 1 FROM bar_stock_item_allergen_checks WHERE stock_item_id = ?', s.pimms)).toHaveLength(2)
  })
})

describe('without a recipe', () => {
  it('a product keeps its own answer', async () => {
    expect(item(await menu(), s.crisps).allergens).toMatchObject({ checked: false })
    expect((await send('POST', `/api/bar/products/${s.crispsProduct}/allergens`, { contains: ['milk'], mayContain: [] })).status).toBe(200)
    expect(item(await menu(), s.crisps).allergens).toMatchObject({ contains: ['milk'], checked: true })
  })
})

describe('an option with a stock item', () => {
  it('answers with the item\'s allergens, and the size depends on the choice', async () => {
    expect(option(await menu(), s.milkGroup, s.oat).allergens).toMatchObject({ checked: false })
    expect((await send('POST', `/api/bar/stock/items/${s.oatItem}/allergens`, { contains: ['gluten'], mayContain: [] })).status).toBe(200)
    const m = await menu()
    expect(option(m, s.milkGroup, s.oat).allergens).toEqual({ contains: ['gluten'], mayContain: [], checked: true })
    expect(item(m, s.jug).allergens.dependsOnChoice).toBe(true)
  })
})

describe('a size made only from choices', () => {
  it('has no label of its own: it is checked, and depends on what is picked', async () => {
    const spirit = await commit(async (unit) => {
      const v = unit.view()
      const category = (await rows<{ category_id: string }>('SELECT category_id FROM bar_products WHERE id = ?', s.crispsProduct))[0]!.category_id
      const made = await addProduct(v, { categoryId: category, name: 'Stock allergen spirit and mixer' }, { amountMinor: 500 }, manager.accountId!)
      setProductGroups(v, made.productId, [s.milkGroup])
      return made.variantId
    })
    await commit(unit => setRecipe(unit.view(), spirit, { lines: [{ choiceGroupId: s.milkGroup, quantity: 1 }] }))
    expect(item(await menu(), spirit).allergens).toEqual({ contains: [], mayContain: [], checked: true, dependsOnChoice: true })
  })
})

describe('step 3: the public chart, the home card and the re-check prompt', () => {
  const chart = async () => {
    const response = await call(handle, 'GET', '/api/bar/allergens/chart')
    return { status: response.status, body: await response.json() as any }
  }
  const row = (c: any, variantId: string) => c.outlets.flatMap((o: any) => o.categories.flatMap((k: any) => k.rows)).find((r: any) => r.variantId === variantId)

  it('shows anyone the till\'s answers, with each choice\'s options', async () => {
    const c = await chart()
    expect(c.status).toBe(200)
    expect(row(c.body, s.jug).allergens).toMatchObject({ contains: [], mayContain: ['sulphites'], checked: true })
    expect(row(c.body, s.jug).choices).toEqual([{ group: 'Stock allergen milk', options: [{ label: 'Oat', allergens: { contains: ['gluten'], mayContain: [], checked: true } }] }])
  })

  it('says it is incomplete, and counts what is not checked, while a size on sale is unchecked', async () => {
    const before = await inContext(() => uncheckedCount.value(manager))
    const water = await commit(async (unit) => {
      const category = (await rows<{ category_id: string }>('SELECT category_id FROM bar_products WHERE id = ?', s.crispsProduct))[0]!.category_id
      return (await addProduct(unit.view(), { categoryId: category, name: 'Stock allergen water' }, { amountMinor: 100 }, manager.accountId!)).variantId
    })
    const c = await chart()
    expect(c.body.complete).toBe(false)
    expect(row(c.body, water).allergens.checked).toBe(false)
    expect(await inContext(() => uncheckedCount.value(manager))).toBe(before + 1)
    expect(await inContext(() => uncheckedCount.value(person(['bar.sale.sell'])))).toBe(0)
  })

  it('lists the same sizes the home card counts, so its link never lands on an empty list', async () => {
    // A product with no recipe answers with its own label, so it is listed though no stock item is unchecked.
    const juice = await commit(async (unit) => {
      const category = (await rows<{ category_id: string }>('SELECT category_id FROM bar_products WHERE id = ?', s.crispsProduct))[0]!.category_id
      return await addProduct(unit.view(), { categoryId: category, name: 'Stock allergen juice' }, { amountMinor: 150 }, manager.accountId!)
    })
    const count = await inContext(() => uncheckedCount.value(manager))
    const list = await send('GET', '/api/bar/allergens/unchecked')
    expect(list.status).toBe(200)
    expect(list.body.sizes).toHaveLength(count)
    expect(list.body.sizes).toContainEqual(juice)
    expect(list.body.sizes).not.toContainEqual({ variantId: s.crisps, productId: s.crispsProduct })
    const seller = await call(handle, 'GET', '/api/bar/allergens/unchecked', { actor: person(['bar.sale.sell']) })
    expect(seller.status).toBe(403)
  })

  it('asks for a label read again once the re-check period has passed, or when it never was', async () => {
    const never = await commit(unit => addStockItem(unit.view(), { name: 'Stock allergen tonic', baseUnit: 'each', packSize: 24, packName: 'case', countUnitSize: 1 }))
    expect((await inContext(() => labelsDue([s.pimms, never]))).map(d => d.stockItemId)).toEqual([never])
    setClock(NOW + 200 * 86_400_000) // not-policy: past the six-month default
    expect((await inContext(() => labelsDue([s.pimms, never]))).map(d => d.stockItemId)).toEqual([s.pimms, never])
    setClock(NOW)
  })

  it('is not there when the theatre does not publish it', async () => {
    await commit(unit => changeSetting(unit.view(), 'bar.allergens.publish' as never, false, { reason: 'test' }))
    expect((await chart()).status).toBe(404)
  })
})
