// Moving stock by hand (tab 3, "Stock movements" and "A delivery"): a delivery is a draft until it is
// received, then final, and receiving it moves packs and loose units in and records the pack cost;
// wastage needs a reason from the list; a move between locations is equal and opposite; and each is
// one batch.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { addTerm, ensureVocabularies } from '../../../core/server/vocabularies/service'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import stockGet from '../../server/api/bar/stock/index.get'
import itemPost from '../../server/api/bar/stock/items/index.post'
import itemPatch from '../../server/api/bar/stock/items/[id]/index.patch'
import locationPost from '../../server/api/bar/stock/locations/index.post'
import deliveriesGet from '../../server/api/bar/stock/deliveries/index.get'
import deliveryPost from '../../server/api/bar/stock/deliveries/index.post'
import deliveryPatch from '../../server/api/bar/stock/deliveries/[id].patch'
import deliveryDelete from '../../server/api/bar/stock/deliveries/[id].delete'
import receivePost from '../../server/api/bar/stock/deliveries/[id]/receive.post'
import wastagePost from '../../server/api/bar/stock/wastage.post'
import transferPost from '../../server/api/bar/stock/transfers.post'
import movementsGet from '../../server/api/bar/stock/movements.get'

const NOW = Date.UTC(2026, 10, 18, 1) // not-policy: a test's moment
const handle = server({
  'GET /api/bar/stock': stockGet,
  'POST /api/bar/stock/items': itemPost,
  'PATCH /api/bar/stock/items/:id': itemPatch,
  'POST /api/bar/stock/locations': locationPost,
  'GET /api/bar/stock/deliveries': deliveriesGet,
  'POST /api/bar/stock/deliveries': deliveryPost,
  'PATCH /api/bar/stock/deliveries/:id': deliveryPatch,
  'DELETE /api/bar/stock/deliveries/:id': deliveryDelete,
  'POST /api/bar/stock/deliveries/:id/receive': receivePost,
  'POST /api/bar/stock/wastage': wastagePost,
  'POST /api/bar/stock/transfers': transferPost,
  'GET /api/bar/stock/movements': movementsGet,
})
const manager = person(['bar.stock.manage', 'bar.stock.receive', 'bar.stock.waste'], { reassertedAt: NOW })
const cellarHand = person(['bar.stock.receive'], { reassertedAt: NOW })

async function send(method: string, path: string, body?: unknown, actor = manager) {
  const response = await call(handle, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const s = { bar: '', cellar: '', cans: '', wine: '', retired: '', supplier: '', broken: '' }
const levels = async () => Object.fromEntries((await rows<{ name: string, location: string, quantity: number }>(
  `SELECT i.name, l.name AS location, v.quantity FROM bar_stock_levels v JOIN bar_stock_items i ON i.id = v.stock_item_id JOIN bar_stock_locations l ON l.id = v.location_id
    WHERE i.name LIKE 'Moves %' ORDER BY i.name, l.name`,
)).map(r => [`${r.name} @ ${r.location}`, r.quantity]))

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await inContext(() => ensureVocabularies())
  s.supplier = await inContext(async () => {
    const unit = createUnit()
    const termId = await addTerm(unit.view(), 'bar.supplier', { label: 'Moves Brewery Ltd' })
    await unit.commit()
    return termId
  })
  s.broken = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'bar.wastage-reason' AND slug = 'broken'"))[0]!.id
  s.bar = (await send('POST', '/api/bar/stock/locations', { name: 'Moves bar' })).body.locationId
  s.cellar = (await send('POST', '/api/bar/stock/locations', { name: 'Moves cellar' })).body.locationId
  const item = async (body: Record<string, unknown>) => (await send('POST', '/api/bar/stock/items', body)).body.stockItemId as string
  s.cans = await item({ name: 'Moves cola can', baseUnit: 'each', packSize: 24, packName: 'case', countUnitSize: 1 })
  s.wine = await item({ name: 'Moves house red', baseUnit: 'ml', packSize: 4500, packName: 'case of six', countUnitSize: 750, costMinor: 3000 })
  s.retired = await item({ name: 'Moves old lager', baseUnit: 'each', packSize: 24, packName: 'case', countUnitSize: 1 })
  await send('PATCH', `/api/bar/stock/items/${s.retired}`, { active: false })
})

describe('a delivery', () => {
  it('is a draft until received, then moves packs and loose units in, takes the pack cost and is final', async () => {
    const made = await send('POST', '/api/bar/stock/deliveries', {
      locationId: s.cellar, supplierTermId: s.supplier, supplierRef: 'DN-1042',
      lines: [{ stockItemId: s.cans, packs: 2, looseUnits: 0 }],
    }, cellarHand)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const deliveryId = made.body.deliveryId
    expect(await levels()).toEqual({})

    // The draft changes: the wine arrives too, with a new price.
    expect((await send('PATCH', `/api/bar/stock/deliveries/${deliveryId}`, {
      lines: [{ stockItemId: s.cans, packs: 2, looseUnits: 6 }, { stockItemId: s.wine, packs: 1, looseUnits: 750, packCostMinor: 3300 }],
    }, cellarHand)).status).toBe(200)
    const listed = (await send('GET', '/api/bar/stock/deliveries', undefined, cellarHand)).body
    const draft = listed.deliveries.find((d: any) => d.id === deliveryId)
    expect(draft).toMatchObject({ state: 'draft', supplier: 'Moves Brewery Ltd', supplierRef: 'DN-1042', receivedAt: null })
    expect(draft.lines.map((l: any) => l.quantity)).toEqual([54, 5250])
    expect(listed.suppliers.map((t: any) => t.label)).toContain('Moves Brewery Ltd')
    expect(listed.items.map((i: any) => i.name)).not.toContain('Moves old lager')

    expect((await send('POST', `/api/bar/stock/deliveries/${deliveryId}/receive`, undefined, cellarHand)).status).toBe(200)
    expect(await levels()).toEqual({ 'Moves cola can @ Moves cellar': 54, 'Moves house red @ Moves cellar': 5250 })
    expect((await rows<{ cost_minor: number }>('SELECT cost_minor FROM bar_stock_items WHERE id = ?', s.wine))[0]!.cost_minor).toBe(3300)
    expect((await rows('SELECT 1 FROM core_events WHERE name = ?', 'bar.delivery.received')).length).toBeGreaterThan(0)

    // Received is final, and receiving again moves nothing more.
    expect((await send('POST', `/api/bar/stock/deliveries/${deliveryId}/receive`, undefined, cellarHand)).body.code).toBe('bar.delivery.received')
    expect((await send('PATCH', `/api/bar/stock/deliveries/${deliveryId}`, { supplierRef: 'DN-1043' }, cellarHand)).body.code).toBe('bar.delivery.received')
    expect((await send('DELETE', `/api/bar/stock/deliveries/${deliveryId}`, undefined, cellarHand)).body.code).toBe('bar.delivery.received')
    expect(await levels()).toEqual({ 'Moves cola can @ Moves cellar': 54, 'Moves house red @ Moves cellar': 5250 })
  })

  it('refuses an empty one at receipt, a retired item, an unknown supplier and an item twice; a draft can be thrown away', async () => {
    const empty = (await send('POST', '/api/bar/stock/deliveries', { locationId: s.cellar, lines: [] }, cellarHand)).body.deliveryId
    expect((await send('POST', `/api/bar/stock/deliveries/${empty}/receive`, undefined, cellarHand)).body.code).toBe('bar.delivery.empty')
    expect((await send('DELETE', `/api/bar/stock/deliveries/${empty}`, undefined, cellarHand)).status).toBe(200)
    expect(await rows('SELECT 1 FROM bar_deliveries WHERE id = ?', empty)).toHaveLength(0)

    expect((await send('POST', '/api/bar/stock/deliveries', { locationId: s.cellar, lines: [{ stockItemId: s.retired, packs: 1, looseUnits: 0 }] }, cellarHand)).body.code).toBe('bar.stock-item.unknown')
    expect((await send('POST', '/api/bar/stock/deliveries', { locationId: s.cellar, supplierTermId: s.broken, lines: [] }, cellarHand)).body.code).toBe('bar.delivery.supplier')
    expect((await send('POST', '/api/bar/stock/deliveries', {
      locationId: s.cellar, lines: [{ stockItemId: s.cans, packs: 1, looseUnits: 0 }, { stockItemId: s.cans, packs: 0, looseUnits: 2 }],
    }, cellarHand)).status).toBe(422)
    expect((await send('POST', '/api/bar/stock/deliveries', { locationId: s.cellar, lines: [{ stockItemId: s.cans, packs: 0, looseUnits: 0 }] }, cellarHand)).status).toBe(422)
  })
})

describe('moving and wasting stock', () => {
  it('moves stock between locations equal and opposite, even below nought', async () => {
    const moved = await send('POST', '/api/bar/stock/transfers', { fromLocationId: s.cellar, toLocationId: s.bar, lines: [{ stockItemId: s.cans, quantity: 24 }, { stockItemId: s.wine, quantity: 6000 }] }, cellarHand)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(await levels()).toEqual({
      'Moves cola can @ Moves bar': 24, 'Moves cola can @ Moves cellar': 30,
      'Moves house red @ Moves bar': 6000, 'Moves house red @ Moves cellar': -750,
    })
    expect((await send('POST', '/api/bar/stock/transfers', { fromLocationId: s.bar, toLocationId: s.bar, lines: [{ stockItemId: s.cans, quantity: 1 }] }, cellarHand)).status).toBe(422)
  })

  it('writes stock off with a reason from the list, and shows it in the history', async () => {
    expect((await send('POST', '/api/bar/stock/wastage', { locationId: s.bar, reasonTermId: s.broken, lines: [{ stockItemId: s.cans, quantity: 1 }] }, cellarHand)).status).toBe(403)
    expect((await send('POST', '/api/bar/stock/wastage', { locationId: s.bar, reasonTermId: s.supplier, lines: [{ stockItemId: s.cans, quantity: 1 }] })).body.code).toBe('bar.wastage.reason')
    const wasted = await send('POST', '/api/bar/stock/wastage', { locationId: s.bar, reasonTermId: s.broken, lines: [{ stockItemId: s.cans, quantity: 2 }, { stockItemId: s.wine, quantity: 750 }] })
    expect(wasted.status, JSON.stringify(wasted.body)).toBe(200)
    expect(await levels()).toMatchObject({ 'Moves cola can @ Moves bar': 22, 'Moves house red @ Moves bar': 5250 })

    const history = (await send('GET', `/api/bar/stock/movements?item=${s.cans}&location=${s.bar}`)).body.movements
    expect(history.map((m: any) => [m.kind, m.quantity, m.reason])).toEqual([['wastage', -2, 'Broken or spilled'], ['transfer_in', 24, null]])
    expect(history[0].by).toBeTruthy()
    expect((await send('GET', '/api/bar/stock')).body.wastageReasons.map((t: any) => t.label)).toContain('Out of date')
  })

  it('refuses a retired item or location', async () => {
    expect((await send('POST', '/api/bar/stock/wastage', { locationId: s.bar, reasonTermId: s.broken, lines: [{ stockItemId: s.retired, quantity: 1 }] })).body.code).toBe('bar.stock-item.unknown')
    expect((await send('POST', '/api/bar/stock/transfers', { fromLocationId: s.bar, toLocationId: 'bstl_nowhere', lines: [{ stockItemId: s.cans, quantity: 1 }] }, cellarHand)).body.code).toBe('bar.stock-location.unknown')
    // A level is a cache of its movements: they still add up.
    const drift = await env.DB.prepare('SELECT count(*) AS n FROM bar_stock_levels v WHERE quantity <> (SELECT coalesce(sum(quantity), 0) FROM bar_stock_movements m WHERE m.stock_item_id = v.stock_item_id AND m.location_id = v.location_id)').first<{ n: number }>()
    expect(drift!.n).toBe(0)
  })
})
