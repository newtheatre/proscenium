// Category defaults, product presets and the Add a product window (tab 10, approved 17 November).
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import menuGet from '../../server/api/bar/till/menu.get'
import categoryPost from '../../server/api/bar/categories/index.post'
import categoryPatch from '../../server/api/bar/categories/[id].patch'
import productPatch from '../../server/api/bar/products/[id]/index.patch'
import setupPost from '../../server/api/bar/products/setup.post'
import presetsGet from '../../server/api/bar/presets/index.get'
import presetsPost from '../../server/api/bar/presets/index.post'
import presetDelete from '../../server/api/bar/presets/[id].delete'
import presetPatch from '../../server/api/bar/presets/[id].patch'
import standardListener from '../../server/listeners/standard-price-list'
import { addOutlet } from '../../server/catalogue'
import { addGroup, addOption } from '../../server/choices'

const NOW = Date.UTC(2026, 10, 17, 22) // not-policy: a test's moment
const handle = server({
  'GET /api/bar/till/menu': menuGet,
  'POST /api/bar/categories': categoryPost,
  'PATCH /api/bar/categories/:id': categoryPatch,
  'PATCH /api/bar/products/:id': productPatch,
  'POST /api/bar/products/setup': setupPost,
  'GET /api/bar/presets': presetsGet,
  'POST /api/bar/presets': presetsPost,
  'DELETE /api/bar/presets/:id': presetDelete,
  'PATCH /api/bar/presets/:id': presetPatch,
})
const manager = person(['bar.sale.sell', 'bar.product.manage'], { reassertedAt: NOW })

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

const s = { outlet: '', wine: '', soft: '', spirit: '', product: '' }
const items = async () => (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body.categories.flatMap((c: any) => c.items)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit((unit) => {
    s.outlet = addOutlet(unit.view(), { name: 'Presets bar', kind: 'bar' })
    s.spirit = addGroup(unit.view(), { name: 'Presets spirit', source: 'options' })
    addOption(unit.view(), s.spirit, { name: 'Presets gin' })
  })
})

describe('category defaults', () => {
  it('takes an age check and a usual preset, and refuses a preset that does not exist', async () => {
    const wine = await send('POST', '/api/bar/categories', { name: 'Presets wine', ageRestricted: true, usualPreset: 'builtin:wine' })
    expect(wine.status, JSON.stringify(wine.body)).toBe(200)
    s.wine = wine.body.categoryId
    s.soft = (await send('POST', '/api/bar/categories', { name: 'Presets soft' })).body.categoryId
    expect((await send('POST', '/api/bar/categories', { name: 'Presets nothing', usualPreset: 'builtin:nothing' })).body.code).toBe('bar.preset.unknown')
  })
})

describe('adding a product from the window', () => {
  it('adds every size with its price, its choices and its mixer measure in one go', async () => {
    const made = await send('POST', '/api/bar/products/setup', {
      categoryId: s.wine, name: 'Presets house red', ageRestricted: null,
      sizes: [{ name: '125ml', amountMinor: 350 }, { name: '175ml', amountMinor: 450 }, { name: '250ml', amountMinor: 600 }, { name: 'Bottle', amountMinor: 1600 }],
      groupIds: [s.spirit], mixer: true,
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    s.product = made.body.productId
    const red = (await items()).filter((i: any) => i.productId === s.product)
    expect(red.map((i: any) => [i.variant, i.amountMinor])).toEqual([['125ml', 350], ['175ml', 450], ['250ml', 600], ['Bottle', 1600]])
    expect(red[0]).toMatchObject({ ageRestricted: true, groupIds: [s.spirit] })
    expect(await rows('SELECT name FROM bar_variants WHERE product_id = ? AND mixer_measure = 1', s.product)).toEqual([{ name: 'Mixer measure' }])
  })

  it('refuses two sizes with one name, on the row that repeats it', async () => {
    const twice = await send('POST', '/api/bar/products/setup', { categoryId: s.soft, name: 'Presets twice', sizes: [{ name: 'Each' }, { name: 'each' }] })
    expect(twice.status).toBe(422)
    expect(twice.body.fields).toEqual({ 'sizes.1.name': 'bar.screens.add-product.size-taken' })
  })
})

describe('following the category', () => {
  it('follows a change to the category until the product says otherwise', async () => {
    await send('PATCH', `/api/bar/categories/${s.wine}`, { ageRestricted: false })
    expect((await items()).find((i: any) => i.productId === s.product).ageRestricted).toBe(false)
    await send('PATCH', `/api/bar/products/${s.product}`, { ageRestricted: true })
    await send('PATCH', `/api/bar/categories/${s.wine}`, { ageRestricted: false })
    expect((await items()).find((i: any) => i.productId === s.product).ageRestricted).toBe(true)
    await send('PATCH', `/api/bar/products/${s.product}`, { ageRestricted: null })
    await send('PATCH', `/api/bar/categories/${s.wine}`, { ageRestricted: true })
    expect((await items()).find((i: any) => i.productId === s.product).ageRestricted).toBe(true)
  })
})

describe('presets', () => {
  it('lists the built-ins first, saves the theatre\'s own, and retiring one clears it from categories', async () => {
    const saved = await send('POST', '/api/bar/presets', { name: 'House wine (NNT)', sizes: [{ name: '175ml', measure: '175 ml' }, { name: 'Bottle', measure: '750 ml' }], ageRestricted: true })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect((await send('POST', '/api/bar/presets', { name: 'house wine (nnt)', sizes: [{ name: 'Each' }] })).body.code).toBe('bar.preset.name-taken')
    const listed = (await send('GET', '/api/bar/presets')).body.presets
    expect(listed.slice(0, 3).map((p: any) => p.id)).toEqual(['builtin:can', 'builtin:draught', 'builtin:wine'])
    expect(listed.find((p: any) => p.id === saved.body.presetId)).toMatchObject({ builtIn: false, name: 'House wine (NNT)', ageRestricted: true, sizes: [{ name: '175ml', measure: '175 ml' }, { name: 'Bottle', measure: '750 ml' }] })

    await send('PATCH', `/api/bar/categories/${s.wine}`, { usualPreset: saved.body.presetId })
    expect((await send('DELETE', `/api/bar/presets/${saved.body.presetId}`)).status).toBe(200)
    expect(await rows('SELECT usual_preset FROM bar_categories WHERE id = ?', s.wine)).toEqual([{ usual_preset: null }])
    expect((await send('GET', '/api/bar/presets')).body.presets.some((p: any) => p.id === saved.body.presetId)).toBe(false)
  })

  it('refuses a preset with two sizes of one name', async () => {
    const twice = await send('POST', '/api/bar/presets', { name: 'Presets twice', sizes: [{ name: '125ml' }, { name: '125ml' }] })
    expect(twice.status).toBe(422)
    expect(Object.keys(twice.body.fields)).toEqual(['sizes.1.name'])
  })

  it('renames one of the theatre\'s own, and brings a deleted one back', async () => {
    const id = (await send('POST', '/api/bar/presets', { name: 'Presets bottled', sizes: [{ name: 'Each' }] })).body.presetId
    await send('POST', '/api/bar/presets', { name: 'Presets taken', sizes: [{ name: 'Each' }] })
    const taken = await send('PATCH', `/api/bar/presets/${id}`, { name: 'Presets taken' })
    expect(taken.body.code, JSON.stringify(taken.body)).toBe('bar.preset.name-taken')
    expect((await send('PATCH', `/api/bar/presets/${id}`, { name: 'Presets bottle' })).status).toBe(200)
    await send('DELETE', `/api/bar/presets/${id}`)
    expect((await send('PATCH', `/api/bar/presets/${id}`, { active: true })).status).toBe(200)
    expect((await send('GET', '/api/bar/presets')).body.presets.find((p: any) => p.id === id)).toMatchObject({ name: 'Presets bottle' })
  })

  it('has draught, wine and spirits need the age check', async () => {
    const listed = (await send('GET', '/api/bar/presets')).body.presets
    expect(listed.filter((p: any) => p.ageRestricted).map((p: any) => p.id)).toEqual(['builtin:draught', 'builtin:wine', 'builtin:spirit'])
  })
})
