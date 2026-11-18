// Stock with full recipes (tab 2 "Stock", tab 10): a paid sale takes each line's recipe from its
// outlet's location, a fixed line by its own quantity and a slot by the option picked (a mixer by its
// own recipe); a replay moves nothing more; goods handed back on a refund go back; and a level changes
// only by a movement.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { attest, confirmRefund, openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import refundPost from '../../server/api/bar/sales/[reference]/refund.post'
import saleGet from '../../server/api/bar/sales/[reference]/index.get'
import stockGet from '../../server/api/bar/stock/index.get'
import itemPost from '../../server/api/bar/stock/items/index.post'
import itemPatch from '../../server/api/bar/stock/items/[id]/index.patch'
import locationPost from '../../server/api/bar/stock/locations/index.post'
import locationPatch from '../../server/api/bar/stock/locations/[id].patch'
import recipePost from '../../server/api/bar/variants/[id]/recipe.post'
import recipeGet from '../../server/api/bar/variants/[id]/recipe.get'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct, addVariant, updateOutlet } from '../../server/catalogue'
import { addGroup, addOption, setMixer, setProductGroups } from '../../server/choices'
import { moveForSale } from '../../server/stock'

const NOW = Date.UTC(2026, 10, 17, 23) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'GET /api/bar/sales/:reference': saleGet,
  'POST /api/bar/sales/:reference/refund': refundPost,
  'GET /api/bar/stock': stockGet,
  'POST /api/bar/stock/items': itemPost,
  'PATCH /api/bar/stock/items/:id': itemPatch,
  'POST /api/bar/stock/locations': locationPost,
  'PATCH /api/bar/stock/locations/:id': locationPatch,
  'GET /api/bar/variants/:id/recipe': recipeGet,
  'POST /api/bar/variants/:id/recipe': recipePost,
})
const seller = person(['payments.session.open', 'payments.attempt.attest', 'bar.sale.sell'], { reassertedAt: NOW })
const manager = person(['bar.stock.manage', 'bar.sale.refund', 'payments.session.open'], { reassertedAt: NOW })

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
const setSetting = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key as never, value, { reason: 'test', confirm: true }))

const cash = newId('ppa')
const s = { outlet: '', bar: '', cellar: '', keg: '', gin: '', premium: '', tonicCan: '', lemonade: '', pint: '', half: '', single: '', double: '', water: '', spirit: '', mixer: '', ginOption: '', premiumOption: '', tonicMix: '', lemonadeMix: '', smProduct: '' }
const levels = async () => Object.fromEntries((await rows<{ name: string, location: string, quantity: number }>(
  'SELECT i.name, l.name AS location, v.quantity FROM bar_stock_levels v JOIN bar_stock_items i ON i.id = v.stock_item_id JOIN bar_stock_locations l ON l.id = v.location_id ORDER BY i.name, l.name',
)).map(r => [`${r.name} @ ${r.location}`, r.quantity]))
type Line = { variantId: string, quantity: number, choices?: { groupId: string, key: string }[] }
async function sellAndPay(key: string, lines: Line[], total: number): Promise<string> {
  const sold = await send('POST', '/api/payments/till/sale', { panels: [{ basket: 'bar', input: { outletId: s.outlet, clientKey: key, lines, expectedTotalMinor: total } }] }, seller)
  expect(sold.status, JSON.stringify(sold.body)).toBe(200)
  await inContext(() => attest({ intentId: sold.body.intentId, providerAccountId: cash, method: 'cash' }), seller)
  return (await rows<{ reference: string }>('SELECT reference FROM bar_sales WHERE client_key = ?', key))[0]!.reference
}

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOW, NOW).run()
  await commit(async unit => standardListener({ payload: { moduleId: 'bar' } } as any, unit.view()))
  await setSetting('payments.cash.enabled', true)
  await setSetting('core.locale.time-zone', 'Europe/London')
  await setSetting('payments.refunds.self-approve-up-to', 5000)
  const { ensureSystemAccounts } = await import('../../../finance/server/ledger')
  await commit(unit => ensureSystemAccounts(unit.view(), 'bar'))
  await inContext(() => ensureVocabularies())
  for (const who of [seller, manager]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Bar', floatMinor: 0 }))

  // Two locations, and the stock items the drinks are made from.
  s.bar = (await send('POST', '/api/bar/stock/locations', { name: 'Stock bar' })).body.locationId
  s.cellar = (await send('POST', '/api/bar/stock/locations', { name: 'Stock cellar' })).body.locationId
  const item = async (body: Record<string, unknown>) => {
    const made = await send('POST', '/api/bar/stock/items', body)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    return made.body.stockItemId as string
  }
  s.keg = await item({ name: 'Stock cider keg', baseUnit: 'ml', packSize: 20000, packName: 'keg', countUnitSize: 20000, fullWeightG: 30000, emptyWeightG: 10000 })
  s.gin = await item({ name: 'Stock house gin', baseUnit: 'ml', packSize: 700, packName: 'bottle', countUnitSize: 700 })
  s.premium = await item({ name: 'Stock premium gin', baseUnit: 'ml', packSize: 700, packName: 'bottle', countUnitSize: 700 })
  s.tonicCan = await item({ name: 'Stock tonic can', baseUnit: 'each', packSize: 24, packName: 'case', countUnitSize: 1 })
  s.lemonade = await item({ name: 'Stock lemonade', baseUnit: 'ml', packSize: 2000, packName: 'bottle', countUnitSize: 2000 })

  await commit(async (unit) => {
    const v = unit.view()
    const drinks = addCategory(v, { name: 'Stock drinks' })
    const cider = await addProduct(v, { categoryId: drinks, name: 'Stock cider' }, { name: 'Pint', amountMinor: 500 }, seller.accountId!)
    s.pint = cider.variantId
    s.half = await addVariant(v, cider.productId, { name: 'Half' }, 280, seller.accountId!)
    const sm = await addProduct(v, { categoryId: drinks, name: 'Stock G and T' }, { name: 'Single', amountMinor: 450 }, seller.accountId!)
    s.single = sm.variantId
    s.double = await addVariant(v, sm.productId, { name: 'Double' }, 650, seller.accountId!)
    s.smProduct = sm.productId
  })
  await commit(async (unit) => {
    const v = unit.view()
    const soft = addCategory(v, { name: 'Stock soft' })
    s.water = (await addProduct(v, { categoryId: soft, name: 'Stock tap water' }, { amountMinor: 0 }, seller.accountId!)).variantId
    const tonic = await addProduct(v, { categoryId: soft, name: 'Stock tonic' }, { amountMinor: 180 }, seller.accountId!)
    const lemonade = await addProduct(v, { categoryId: soft, name: 'Stock lemonade' }, { amountMinor: 150 }, seller.accountId!)
    await setMixer(v, tonic.productId, true)
    await setMixer(v, lemonade.productId, true)
  })
  await commit(async (unit) => {
    const v = unit.view()
    s.spirit = addGroup(v, { name: 'Stock spirit', source: 'options' })
    s.ginOption = addOption(v, s.spirit, { name: 'House', stockItemId: s.gin })
    s.premiumOption = addOption(v, s.spirit, { name: 'Premium', deltaMinor: 100, stockItemId: s.premium })
    s.mixer = addGroup(v, { name: 'Stock mixer', source: 'mixers', mixerPricing: 'included' })
    setProductGroups(v, s.smProduct, [s.spirit, s.mixer])
    s.outlet = addOutlet(v, { name: 'Stock outlet', kind: 'bar', stockLocationId: s.bar })
  })
  const mixers = await rows<{ id: string, product: string }>("SELECT v.id, p.name AS product FROM bar_variants v JOIN bar_products p ON p.id = v.product_id WHERE v.mixer_measure = 1 AND p.name LIKE 'Stock %'")
  s.tonicMix = mixers.find(m => m.product === 'Stock tonic')!.id
  s.lemonadeMix = mixers.find(m => m.product === 'Stock lemonade')!.id
})

const recipe = (variantId: string, lines: Record<string, unknown>[]) => send('POST', `/api/bar/variants/${variantId}/recipe`, { lines })

describe('setting up stock', () => {
  it('lists items and locations, and refuses a second item of the same name or weights the wrong way round', async () => {
    const listed = (await send('GET', '/api/bar/stock')).body
    expect(listed.locations.map((l: any) => l.name)).toEqual(['Stock bar', 'Stock cellar'])
    expect(listed.items.find((i: any) => i.id === s.keg)).toMatchObject({ baseUnit: 'ml', packSize: 20000, fullWeightG: 30000, emptyWeightG: 10000, total: 0, low: false })
    expect((await send('POST', '/api/bar/stock/items', { name: 'stock CIDER keg', baseUnit: 'ml', packSize: 1, packName: 'keg', countUnitSize: 1 })).body.code).toBe('bar.stock-item.refused')
    expect((await send('POST', '/api/bar/stock/items', { name: 'Stock odd', baseUnit: 'g', packSize: 1, packName: 'tub', countUnitSize: 1, fullWeightG: 10, emptyWeightG: 20 })).status).toBe(422)
    expect((await send('GET', '/api/bar/stock', undefined, seller)).status).toBe(403)
  })

  it('writes recipes of fixed items and choice slots, and refuses a slot the product does not ask', async () => {
    expect((await recipe(s.pint, [{ stockItemId: s.keg, quantity: 568 }])).status).toBe(200)
    expect((await recipe(s.half, [{ stockItemId: s.keg, quantity: 284 }])).status).toBe(200)
    expect((await recipe(s.single, [{ choiceGroupId: s.spirit, quantity: 25 }, { choiceGroupId: s.mixer, quantity: 1 }])).status).toBe(200)
    expect((await recipe(s.double, [{ choiceGroupId: s.spirit, quantity: 50 }, { choiceGroupId: s.mixer, quantity: 1 }])).status).toBe(200)
    expect((await recipe(s.tonicMix, [{ stockItemId: s.tonicCan, quantity: 1 }])).status).toBe(200)
    expect((await recipe(s.lemonadeMix, [{ stockItemId: s.lemonade, quantity: 200 }])).status).toBe(200)
    expect((await recipe(s.pint, [{ choiceGroupId: s.spirit, quantity: 25 }])).body.code).toBe('bar.recipe.unknown-choice')
    expect((await send('GET', `/api/bar/variants/${s.double}/recipe`)).body.lines).toMatchObject([{ choiceGroupId: s.spirit, quantity: 50 }, { choiceGroupId: s.mixer, quantity: 1 }])
    // A refused recipe leaves the one before it.
    expect((await send('GET', `/api/bar/variants/${s.pint}/recipe`)).body.lines).toMatchObject([{ stockItemId: s.keg, quantity: 568 }])
  })
})

describe('selling moves stock', () => {
  let reference = ''

  it('takes each line by its recipe from the outlet\'s location when the sale is paid', async () => {
    reference = await sellAndPay('stock-1-xxxxxxxx', [
      { variantId: s.pint, quantity: 2 },
      { variantId: s.half, quantity: 1 },
      { variantId: s.double, quantity: 2, choices: [{ groupId: s.spirit, key: s.premiumOption }, { groupId: s.mixer, key: s.tonicMix }] },
      { variantId: s.single, quantity: 1, choices: [{ groupId: s.spirit, key: s.ginOption }, { groupId: s.mixer, key: s.lemonadeMix }] },
      { variantId: s.water, quantity: 1 },
    ], 2 * 500 + 280 + 2 * 750 + 450)
    expect(await levels()).toEqual({
      'Stock cider keg @ Stock bar': -(2 * 568 + 284),
      'Stock house gin @ Stock bar': -25,
      'Stock lemonade @ Stock bar': -200,
      'Stock premium gin @ Stock bar': -100,
      'Stock tonic can @ Stock bar': -2,
    })
    expect(await rows('SELECT DISTINCT kind, source_type FROM bar_stock_movements')).toEqual([{ kind: 'sale', source_type: 'bar.sale-line' }])
  })

  it('moves nothing more when the same sale is moved again', async () => {
    const before = await rows('SELECT count(*) AS n FROM bar_stock_movements')
    const saleId = (await rows<{ id: string }>('SELECT id FROM bar_sales WHERE reference = ?', reference))[0]!.id
    await commit(unit => moveForSale(unit.view(), saleId))
    expect(await rows('SELECT count(*) AS n FROM bar_stock_movements')).toEqual(before)
  })

  it('puts back what a refund hands back, in proportion, and nothing for a refund wasted', async () => {
    const lines = (await send('GET', `/api/bar/sales/${reference}`)).body.sale.lines as { id: string, label: string }[]
    const reason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'bar.refund-reason' AND slug = 'faulty'"))[0]!.id
    const double = lines.find(l => l.label.startsWith('Stock G and T, Double'))!.id
    const pint = lines.find(l => l.label === 'Stock cider, Pint')!.id
    const returned = await send('POST', `/api/bar/sales/${reference}/refund`, { reasonTermId: reason, stockOutcome: 'returned', lines: [{ lineId: double, quantity: 1 }], expectedTotalMinor: 750 })
    expect(returned.status, JSON.stringify(returned.body)).toBe(200)
    await commit(unit => confirmRefund(unit.view(), returned.body.refundId, manager.accountId!))
    const wasted = await send('POST', `/api/bar/sales/${reference}/refund`, { reasonTermId: reason, stockOutcome: 'wasted', lines: [{ lineId: pint, quantity: 1 }], expectedTotalMinor: 500 })
    await commit(unit => confirmRefund(unit.view(), wasted.body.refundId, manager.accountId!))
    expect(await levels()).toMatchObject({ 'Stock premium gin @ Stock bar': -50, 'Stock tonic can @ Stock bar': -1, 'Stock cider keg @ Stock bar': -(2 * 568 + 284) })
  })

  it('moves no stock from an outlet with no location', async () => {
    await commit(unit => updateOutlet(unit.view(), s.outlet, { stockLocationId: null }))
    const before = await levels()
    await sellAndPay('stock-2-xxxxxxxx', [{ variantId: s.pint, quantity: 1 }], 500)
    expect(await levels()).toEqual(before)
    await commit(unit => updateOutlet(unit.view(), s.outlet, { stockLocationId: s.bar }))
  })
})

describe('what guards stock', () => {
  it('changes a level only by a movement', async () => {
    await expect(env.DB.prepare('UPDATE bar_stock_levels SET quantity = 0 WHERE stock_item_id = ?').bind(s.keg).run()).rejects.toThrow(/only by a movement/)
    await expect(env.DB.prepare('DELETE FROM bar_stock_levels WHERE stock_item_id = ?').bind(s.keg).run()).rejects.toThrow(/only by a movement/)
    await expect(env.DB.prepare('UPDATE bar_stock_movements SET quantity = 1').run()).rejects.toThrow(/append-only/)
  })

  it('keeps the unit of an item that has moved, and drops a retired item from recipes and options', async () => {
    expect((await send('PATCH', `/api/bar/stock/items/${s.keg}`, { baseUnit: 'g' })).body.code).toBe('bar.stock-item.refused')
    expect((await send('PATCH', `/api/bar/stock/items/${s.lemonade}`, { reorderLevel: 1000 })).status).toBe(200)
    expect((await send('GET', '/api/bar/stock')).body.items.find((i: any) => i.id === s.lemonade)).toMatchObject({ total: -200, low: true })
    expect((await send('PATCH', `/api/bar/stock/items/${s.premium}`, { active: false })).status).toBe(200)
    expect(await rows('SELECT stock_item_id FROM bar_choice_options WHERE id = ?', s.premiumOption)).toEqual([{ stock_item_id: null }])
  })

  it('will not retire a location that holds stock or that an outlet sells from', async () => {
    expect((await send('PATCH', `/api/bar/stock/locations/${s.bar}`, { active: false })).body.code).toBe('bar.stock-location.holds-stock')
    expect((await send('PATCH', `/api/bar/stock/locations/${s.cellar}`, { active: false })).status).toBe(200)
  })
})
