// Allergens, build step 2: recorded on stock items, and worked out for every size made from them. A
// size is checked only when every item its recipe names is; an option with a stock item answers with
// the item's; a product with no recipe keeps its own answer.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import menuGet from '../../server/api/bar/till/menu.get'
import itemAllergensPost from '../../server/api/bar/stock/items/[id]/allergens.post'
import itemAllergensGet from '../../server/api/bar/stock/items/[id]/allergens.get'
import productAllergensPost from '../../server/api/bar/products/[id]/allergens.post'
import productAllergensGet from '../../server/api/bar/products/[id]/allergens.get'
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
