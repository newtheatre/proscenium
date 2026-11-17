// The till's layout (tab 10, approved 17 November): one level of sub-category, each outlet's choice of
// chips, folders or a side list, and the sizes it pins to the front.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import menuGet from '../../server/api/bar/till/menu.get'
import categoryPost from '../../server/api/bar/categories/index.post'
import categoryPatch from '../../server/api/bar/categories/[id].patch'
import outletPatch from '../../server/api/bar/outlets/[id]/index.patch'
import favouritesPost from '../../server/api/bar/outlets/[id]/favourites.post'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'
import { setMixer } from '../../server/choices'

const NOW = Date.UTC(2026, 10, 17, 22) // not-policy: a test's moment
const handle = server({
  'GET /api/bar/till/menu': menuGet,
  'POST /api/bar/categories': categoryPost,
  'PATCH /api/bar/categories/:id': categoryPatch,
  'PATCH /api/bar/outlets/:id': outletPatch,
  'POST /api/bar/outlets/:id/favourites': favouritesPost,
})
const manager = person(['bar.sale.sell', 'bar.product.manage', 'bar.outlet.manage'], { reassertedAt: NOW })

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

const s = { outlet: '', spirits: '', gin: '', soft: '', ginTonic: '', cola: '', colaProduct: '' }
const menu = async () => (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    s.spirits = addCategory(v, { name: 'Layout spirits' })
    s.soft = addCategory(v, { name: 'Layout soft' })
    s.outlet = addOutlet(v, { name: 'Layout bar', kind: 'bar' })
    const cola = await addProduct(v, { categoryId: s.soft, name: 'Layout cola' }, { amountMinor: 200 }, manager.accountId!)
    s.cola = cola.variantId
    s.colaProduct = cola.productId
  })
})

describe('sub-categories', () => {
  it('puts a category under a top-level one, and shows the parent on the menu though it sells nothing itself', async () => {
    const made = await send('POST', '/api/bar/categories', { name: 'Layout gin', parentId: s.spirits })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    s.gin = made.body.categoryId
    await commit(async (unit) => {
      s.ginTonic = (await addProduct(unit.view(), { categoryId: s.gin, name: 'Layout gin and tonic' }, { amountMinor: 500 }, manager.accountId!)).variantId
    })
    const categories = (await menu()).categories
    expect(categories.find((c: any) => c.id === s.gin)).toMatchObject({ parentId: s.spirits, items: [{ variantId: s.ginTonic }] })
    expect(categories.find((c: any) => c.id === s.spirits)).toMatchObject({ parentId: null, items: [] })
  })

  it('keeps to one level', async () => {
    expect((await send('POST', '/api/bar/categories', { name: 'Layout too deep', parentId: s.gin })).body.code).toBe('bar.category.parent')
    expect((await send('PATCH', `/api/bar/categories/${s.spirits}`, { parentId: s.soft })).body.code).toBe('bar.category.parent')
    expect((await send('PATCH', `/api/bar/categories/${s.soft}`, { parentId: s.soft })).body.code).toBe('bar.category.parent')
    expect((await send('PATCH', `/api/bar/categories/${s.gin}`, { parentId: null })).status).toBe(200)
    expect((await send('PATCH', `/api/bar/categories/${s.gin}`, { parentId: s.spirits })).status).toBe(200)
  })
})

describe('the outlet\'s till', () => {
  it('starts with chips and takes another layout', async () => {
    expect((await menu()).tillLayout).toBe('chips')
    expect((await send('PATCH', `/api/bar/outlets/${s.outlet}`, { tillLayout: 'rail' })).status).toBe(200)
    expect((await menu()).tillLayout).toBe('rail')
    expect((await send('PATCH', `/api/bar/outlets/${s.outlet}`, { tillLayout: 'grid' })).status).toBe(422)
  })

  it('pins favourites in order, replacing the last set, and never a mixer measure', async () => {
    expect((await send('POST', `/api/bar/outlets/${s.outlet}/favourites`, { variantIds: [s.cola] })).status).toBe(200)
    expect((await send('POST', `/api/bar/outlets/${s.outlet}/favourites`, { variantIds: [s.ginTonic, s.cola] })).status).toBe(200)
    expect((await menu()).favourites).toEqual([s.ginTonic, s.cola])

    await commit(unit => setMixer(unit.view(), s.colaProduct, true))
    const [measure] = await rows<{ id: string }>('SELECT id FROM bar_variants WHERE product_id = ? AND mixer_measure = 1', s.colaProduct)
    expect((await send('POST', `/api/bar/outlets/${s.outlet}/favourites`, { variantIds: [measure!.id] })).body.code).toBe('bar.favourite.unknown')
    expect((await menu()).favourites).toEqual([s.ginTonic, s.cola])
  })
})
