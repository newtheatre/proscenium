// Allergens, build step 1 (tab 10, approved 17 November): recorded on products and on the options
// that bring their own, with every check kept, and carried on the till's menu. Three answers only:
// contains, may contain, not checked.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import menuGet from '../../server/api/bar/till/menu.get'
import productAllergensPost from '../../server/api/bar/products/[id]/allergens.post'
import productAllergensGet from '../../server/api/bar/products/[id]/allergens.get'
import optionAllergensPost from '../../server/api/bar/choice-options/[id]/allergens.post'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'
import { addGroup, addOption, setMixer, setProductGroups } from '../../server/choices'

const NOW = Date.UTC(2026, 10, 17, 22) // not-policy: a test's moment
const handle = server({
  'GET /api/bar/till/menu': menuGet,
  'POST /api/bar/products/:id/allergens': productAllergensPost,
  'GET /api/bar/products/:id/allergens': productAllergensGet,
  'POST /api/bar/choice-options/:id/allergens': optionAllergensPost,
})
const manager = person(['bar.sale.sell', 'bar.allergens.manage'], { reassertedAt: NOW })
const seller = person(['bar.sale.sell'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T> | T): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function send(method: string, path: string, body?: unknown, actor = manager) {
  const response = await call(handle, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}

const s = { outlet: '', choc: '', chocProduct: '', tonicProduct: '', gt: '', shot: '', cream: '', whisky: '', mixer: '', tonicMix: '' }
const menu = async () => (await send('GET', `/api/bar/till/menu?outlet=${s.outlet}`)).body
const item = (m: any, variantId: string) => m.categories.flatMap((c: any) => c.items).find((i: any) => i.variantId === variantId)
const option = (m: any, groupId: string, key: string) => m.groups.find((g: any) => g.id === groupId).options.find((o: any) => o.key === key)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await commit(async (unit) => {
    const v = unit.view()
    const hot = addCategory(v, { name: 'Allergen hot' })
    const soft = addCategory(v, { name: 'Allergen soft' })
    const choc = await addProduct(v, { categoryId: hot, name: 'Allergen hot chocolate' }, { amountMinor: 250 }, manager.accountId!)
    s.choc = choc.variantId
    s.chocProduct = choc.productId
    s.tonicProduct = (await addProduct(v, { categoryId: soft, name: 'Allergen tonic' }, { amountMinor: 180 }, manager.accountId!)).productId
    s.gt = (await addProduct(v, { categoryId: soft, name: 'Allergen gin and mixer' }, { amountMinor: 450 }, manager.accountId!)).productId
    s.outlet = addOutlet(v, { name: 'Allergen bar', kind: 'bar' })
  })
  await commit(async (unit) => {
    const v = unit.view()
    await setMixer(v, s.tonicProduct, true)
    s.shot = addGroup(v, { name: 'Allergen shot', source: 'options', required: false })
    s.cream = addOption(v, s.shot, { name: 'Irish cream', deltaMinor: 200, ageRestricted: true })
    s.whisky = addOption(v, s.shot, { name: 'Allergen whisky', deltaMinor: 200, ageRestricted: true })
    s.mixer = addGroup(v, { name: 'Allergen mixer', source: 'mixers', mixerPricing: 'included', required: false })
    setProductGroups(v, s.chocProduct, [s.shot])
    setProductGroups(v, s.gt, [s.mixer])
  })
  s.tonicMix = (await rows<{ id: string }>('SELECT id FROM bar_variants WHERE product_id = ? AND mixer_measure = 1', s.tonicProduct))[0]!.id
})

describe('recording allergens', () => {
  it('starts as not checked, never as nothing listed', async () => {
    expect(item(await menu(), s.choc).allergens).toEqual({ contains: [], mayContain: [], checked: false, dependsOnChoice: true })
  })

  it('records a product from its label, in the fixed order, and keeps each check', async () => {
    expect((await send('POST', `/api/bar/products/${s.chocProduct}/allergens`, { contains: ['soya', 'milk'], mayContain: ['nuts'] })).status).toBe(200)
    expect(item(await menu(), s.choc).allergens).toMatchObject({ contains: ['soya', 'milk'], mayContain: ['nuts'], checked: true })
    expect((await send('POST', `/api/bar/products/${s.chocProduct}/allergens`, { contains: ['milk', 'soya'], mayContain: [] })).status).toBe(200)
    const read = (await send('GET', `/api/bar/products/${s.chocProduct}/allergens`)).body
    expect(read.answer).toMatchObject({ contains: ['soya', 'milk'], mayContain: [], checked: true })
    expect(read.history.map((h: any) => h.mayContain)).toEqual([[], ['nuts']])
  })

  it('refuses an allergen both contained and maybe contained, and anyone without the ability', async () => {
    expect((await send('POST', `/api/bar/products/${s.chocProduct}/allergens`, { contains: ['milk'], mayContain: ['milk'] })).status).toBe(422)
    expect((await send('POST', `/api/bar/products/${s.chocProduct}/allergens`, { contains: [], mayContain: [] }, seller)).status).toBe(403)
  })
})

describe('choices', () => {
  it('gives each option its own answer, and a product depends on the choice until every option is checked and clear', async () => {
    expect(item(await menu(), s.choc).allergens.dependsOnChoice).toBe(true)
    await send('POST', `/api/bar/choice-options/${s.cream}/allergens`, { contains: ['milk'], mayContain: [] })
    await send('POST', `/api/bar/choice-options/${s.whisky}/allergens`, { contains: [], mayContain: [] })
    let m = await menu()
    expect(option(m, s.shot, s.cream).allergens).toEqual({ contains: ['milk'], mayContain: [], checked: true })
    expect(option(m, s.shot, s.whisky).allergens).toEqual({ contains: [], mayContain: [], checked: true })
    expect(item(m, s.choc).allergens.dependsOnChoice).toBe(true)

    await send('POST', `/api/bar/choice-options/${s.cream}/allergens`, { contains: [], mayContain: [] })
    m = await menu()
    expect(item(m, s.choc).allergens.dependsOnChoice).toBe(false)
  })

  it('takes a mixer\'s answer from its product', async () => {
    expect(option(await menu(), s.mixer, s.tonicMix).allergens.checked).toBe(false)
    await send('POST', `/api/bar/products/${s.tonicProduct}/allergens`, { contains: [], mayContain: ['sulphites'] })
    expect(option(await menu(), s.mixer, s.tonicMix).allergens).toEqual({ contains: [], mayContain: ['sulphites'], checked: true })
  })
})

describe('settings', () => {
  it('carries the statement, and leaves allergens off the menu when switched off', async () => {
    await commit(unit => changeSetting(unit.view(), 'bar.allergens.statement' as never, 'Made behind one bar.', { reason: 'test' }))
    expect((await menu()).allergenStatement).toBe('Made behind one bar.')
    await commit(unit => changeSetting(unit.view(), 'bar.allergens.enabled' as never, false, { reason: 'test' }))
    const m = await menu()
    expect(m.allergenStatement).toBeNull()
    expect(item(m, s.choc).allergens).toBeUndefined()
    expect(option(m, s.shot, s.cream).allergens).toBeUndefined()
  })
})
