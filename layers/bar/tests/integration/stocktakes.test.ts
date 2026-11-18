// Stocktakes (tab 3, "A stocktake"; tab 10, "Counting by weight"): a count has a line per item in
// use, one live count per location; a keg can be weighed, with any full ones counted beside it; what
// was expected is read when each line is counted, so a sale after that is not taken for stock found;
// approval adjusts each level by what the count found, on top of anything moved since; the person who
// submitted approves only a small difference; a large difference needs a reason; a count sent back is
// counted again, and an abandoned one moves nothing.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import itemPost from '../../server/api/bar/stock/items/index.post'
import locationPost from '../../server/api/bar/stock/locations/index.post'
import deliveryPost from '../../server/api/bar/stock/deliveries/index.post'
import receivePost from '../../server/api/bar/stock/deliveries/[id]/receive.post'
import transferPost from '../../server/api/bar/stock/transfers.post'
import listGet from '../../server/api/bar/stocktakes/index.get'
import startPost from '../../server/api/bar/stocktakes/index.post'
import oneGet from '../../server/api/bar/stocktakes/[id]/index.get'
import countsPost from '../../server/api/bar/stocktakes/[id]/counts.post'
import submitPost from '../../server/api/bar/stocktakes/[id]/submit.post'
import reasonsPost from '../../server/api/bar/stocktakes/[id]/reasons.post'
import sendBackPost from '../../server/api/bar/stocktakes/[id]/send-back.post'
import approvePost from '../../server/api/bar/stocktakes/[id]/approve.post'
import abandonPost from '../../server/api/bar/stocktakes/[id]/abandon.post'
import { addCategory } from '../../server/catalogue'

const NOW = Date.UTC(2026, 10, 18, 2) // not-policy: a test's moment
const handle = server({
  'POST /api/bar/stock/items': itemPost,
  'POST /api/bar/stock/locations': locationPost,
  'POST /api/bar/stock/deliveries': deliveryPost,
  'POST /api/bar/stock/deliveries/:id/receive': receivePost,
  'POST /api/bar/stock/transfers': transferPost,
  'GET /api/bar/stocktakes': listGet,
  'POST /api/bar/stocktakes': startPost,
  'GET /api/bar/stocktakes/:id': oneGet,
  'POST /api/bar/stocktakes/:id/counts': countsPost,
  'POST /api/bar/stocktakes/:id/submit': submitPost,
  'POST /api/bar/stocktakes/:id/reasons': reasonsPost,
  'POST /api/bar/stocktakes/:id/send-back': sendBackPost,
  'POST /api/bar/stocktakes/:id/approve': approvePost,
  'POST /api/bar/stocktakes/:id/abandon': abandonPost,
})
const manager = person(['bar.stock.manage', 'bar.stock.receive', 'bar.stocktake.approve'], { reassertedAt: NOW })
const counter = person(['bar.stock.count'], { reassertedAt: NOW })
const otherCounter = person(['bar.stock.count'], { reassertedAt: NOW })

async function send(method: string, path: string, body?: unknown, actor = manager) {
  const response = await call(handle, method, path, { actor, body: body ?? (method === 'GET' ? undefined : {}), headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T> | T): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const s = { bar: '', cellar: '', snacks: '', crisps: '', cider: '', gin: '', kegs: '' }
const level = async (item: string, location: string) => (await rows<{ quantity: number, last_counted_at: number | null }>('SELECT quantity, last_counted_at FROM bar_stock_levels WHERE stock_item_id = ? AND location_id = ?', item, location))[0]
const lineOf = (lines: any[], item: string) => lines.find(l => l.stockItemId === item)

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await inContext(() => ensureVocabularies())
  s.snacks = await commit(unit => addCategory(unit.view(), { name: 'Count snacks' }))
  s.bar = (await send('POST', '/api/bar/stock/locations', { name: 'Count bar' })).body.locationId
  s.cellar = (await send('POST', '/api/bar/stock/locations', { name: 'Count cellar' })).body.locationId
  const item = async (body: Record<string, unknown>) => (await send('POST', '/api/bar/stock/items', body)).body.stockItemId as string
  s.crisps = await item({ name: 'Count crisps', categoryId: s.snacks, baseUnit: 'each', packSize: 32, packName: 'box', countUnitSize: 1, costMinor: 1600 })
  // A 20 l keg weighing 30 kg full and 10 kg empty, at £100.
  s.cider = await item({ name: 'Count cider keg', baseUnit: 'ml', packSize: 20000, packName: 'keg', countUnitSize: 20000, costMinor: 10000, fullWeightG: 30000, emptyWeightG: 10000 })
  s.gin = await item({ name: 'Count gin', baseUnit: 'ml', packSize: 700, packName: 'bottle', countUnitSize: 700, costMinor: 1400 })
  const d = (await send('POST', '/api/bar/stock/deliveries', { locationId: s.bar, lines: [
    { stockItemId: s.crisps, packs: 1, looseUnits: 0 }, { stockItemId: s.cider, packs: 2, looseUnits: 0 }, { stockItemId: s.gin, packs: 2, looseUnits: 0 },
  ] })).body.deliveryId
  expect((await send('POST', `/api/bar/stock/deliveries/${d}/receive`)).status).toBe(200)
})

describe('a stocktake', () => {
  it('counts every item in use, one live count per location, weighing a keg', async () => {
    const started = await send('POST', '/api/bar/stocktakes', { locationId: s.bar }, counter)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    const id = started.body.stocktakeId
    expect((await send('POST', '/api/bar/stocktakes', { locationId: s.bar }, otherCounter)).body.code).toBe('bar.stocktake.live')

    let got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, counter)).body
    expect(got.stocktake).toMatchObject({ state: 'counting', location: 'Count bar', startedBy: expect.any(String) })
    const lines = got.lines.filter((l: any) => [s.crisps, s.cider, s.gin].includes(l.stockItemId))
    expect(lines).toHaveLength(3)
    expect(lineOf(lines, s.cider)).toMatchObject({ weighable: true, level: 40000, counted: null, expected: null })

    // Submitting before every line is counted is refused.
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: lineOf(lines, s.crisps).id, counted: 32 }] }, counter)).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/submit`, undefined, counter)).body.code).toBe('bar.stocktake.uncounted')

    // The keg is weighed: 25 kg between 10 kg empty and 30 kg full is three quarters of 20 l, so 15 l.
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: lineOf(lines, s.cider).id, weighedG: 25000 }] }, counter)).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: lineOf(lines, s.crisps).id, weighedG: 100 }] }, counter)).body.code).toBe('bar.stocktake.not-weighed')
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: lineOf(lines, s.gin).id, counted: 1400 }] }, counter)).status).toBe(200)
    // Lines for items made by other tests in this database are taken out of the count.
    const others = got.lines.filter((l: any) => ![s.crisps, s.cider, s.gin].includes(l.stockItemId))
    if (others.length) expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: others.map((l: any) => ({ lineId: l.id, notCounted: true })) }, counter)).status).toBe(200)

    got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, counter)).body
    expect(lineOf(got.lines, s.cider).counted).toBe(15000)

    // Two crisps go after all 32 were counted; what was expected is the level when they were counted,
    // so the count matches and the two are not mistaken for crisps found.
    expect((await send('POST', '/api/bar/stock/transfers', { fromLocationId: s.bar, toLocationId: s.cellar, lines: [{ stockItemId: s.crisps, quantity: 2 }] })).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/submit`, undefined, counter)).status).toBe(200)
    got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, manager)).body
    expect(got.stocktake.state).toBe('submitted')
    expect(lineOf(got.lines, s.crisps)).toMatchObject({ expected: 32, counted: 32, varianceValueMinor: 0 })
    // Cider: 25 l short at £100 per 20 l is -£125.
    expect(lineOf(got.lines, s.cider)).toMatchObject({ expected: 40000, counted: 15000, varianceValueMinor: -12500 })
    expect(got.stocktake.varianceValueMinor).toBe(-12500)
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: lineOf(lines, s.gin).id, counted: 1 }] }, counter)).body.code).toBe('bar.stocktake.state')

    // A reason for the cider, from the list.
    const reason = got.reasons.find((r: any) => r.label === 'Waste not recorded').id
    expect((await send('POST', `/api/bar/stocktakes/${id}/reasons`, { lines: [{ lineId: lineOf(got.lines, s.cider).id, reasonTermId: reason }] })).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/reasons`, { lines: [{ lineId: lineOf(got.lines, s.cider).id, reasonTermId: 'trm_nope' }] })).body.code).toBe('bar.stocktake.reason')

    // Approval adjusts on top of what moved since submission.
    expect((await send('POST', '/api/bar/stock/transfers', { fromLocationId: s.bar, toLocationId: s.cellar, lines: [{ stockItemId: s.gin, quantity: 100 }] })).status).toBe(200)
    const approved = await send('POST', `/api/bar/stocktakes/${id}/approve`)
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body.changed).toBe(1)
    expect(await level(s.cider, s.bar)).toMatchObject({ quantity: 15000, last_counted_at: NOW })
    expect(await level(s.gin, s.bar)).toMatchObject({ quantity: 1300, last_counted_at: NOW })
    // The crisps that went after counting stay gone: no phantom stock is put back.
    expect(await level(s.crisps, s.bar)).toMatchObject({ quantity: 30, last_counted_at: NOW })
    expect(await rows('SELECT kind, quantity, source_type FROM bar_stock_movements WHERE stock_item_id = ? AND kind = \'adjustment\'', s.cider)).toEqual([{ kind: 'adjustment', quantity: -25000, source_type: 'bar.stocktake-line' }])
    expect(await rows('SELECT count(*) AS n FROM core_events WHERE name = ?', 'bar.stocktake.approved')).toEqual([{ n: 1 }])
    expect((await send('POST', `/api/bar/stocktakes/${id}/approve`)).body.code).toBe('bar.stocktake.state')
  })

  it('lets the submitter approve only a small difference, is sent back, and abandons with nothing moved', async () => {
    await commit(unit => changeSetting(unit.view(), 'bar.stocktake.self-approve-under' as never, 500, { reason: 'test', confirm: true }))
    const approverWhoCounts = person(['bar.stocktake.approve'], { reassertedAt: NOW })
    const id = (await send('POST', '/api/bar/stocktakes', { locationId: s.bar, categoryId: s.snacks }, approverWhoCounts)).body.stocktakeId
    let got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, approverWhoCounts)).body
    expect(got.lines.map((l: any) => l.stockItemId)).toEqual([s.crisps])
    const line = got.lines[0].id
    // 11 crisps short at 50p each is £5.50: over the £5.00 they may approve themselves.
    await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: line, counted: 19 }] }, approverWhoCounts)
    await send('POST', `/api/bar/stocktakes/${id}/submit`, undefined, approverWhoCounts)
    got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, approverWhoCounts)).body
    expect(got.stocktake.varianceValueMinor).toBe(-550)
    // The screen is told, so it does not offer a button that would be refused.
    expect(got.can).toEqual({ approve: true, ownCount: true })
    expect(got.selfApproveUnderMinor).toBe(500)
    expect((await send('GET', `/api/bar/stocktakes/${id}`)).body.can).toEqual({ approve: true, ownCount: false })
    expect((await send('POST', `/api/bar/stocktakes/${id}/approve`, undefined, approverWhoCounts)).body.code).toBe('bar.stocktake.own-count')

    // Sent back, counted again closer, and approved by the same person.
    expect((await send('POST', `/api/bar/stocktakes/${id}/send-back`)).status).toBe(200)
    got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, approverWhoCounts)).body
    expect(got.stocktake).toMatchObject({ state: 'counting', varianceValueMinor: null })
    await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: line, counted: 22 }] }, approverWhoCounts)
    await send('POST', `/api/bar/stocktakes/${id}/submit`, undefined, approverWhoCounts)
    expect((await send('POST', `/api/bar/stocktakes/${id}/approve`, undefined, approverWhoCounts)).status).toBe(200)
    expect((await level(s.crisps, s.bar))!.quantity).toBe(22)

    // Abandoning: only the starter or an approver, and nothing moves.
    const other = (await send('POST', '/api/bar/stocktakes', { locationId: s.cellar }, counter)).body.stocktakeId
    expect((await send('POST', `/api/bar/stocktakes/${other}/abandon`, undefined, otherCounter)).body.code).toBe('bar.stocktake.not-yours')
    expect((await send('POST', `/api/bar/stocktakes/${other}/abandon`, undefined, counter)).status).toBe(200)
    expect((await level(s.crisps, s.cellar))!.quantity).toBe(2)
    const listed = (await send('GET', '/api/bar/stocktakes', undefined, counter)).body
    expect(listed.stocktakes.find((t: any) => t.id === other).state).toBe('abandoned')
    expect(listed.can.approve).toBe(false)
  })

  it('adds full ones to an open one weighed, and wants a reason for a large difference', async () => {
    const store = (await send('POST', '/api/bar/stock/locations', { name: 'Count store' })).body.locationId
    const d = (await send('POST', '/api/bar/stock/deliveries', { locationId: store, lines: [{ stockItemId: s.cider, packs: 3, looseUnits: 0 }] })).body.deliveryId
    expect((await send('POST', `/api/bar/stock/deliveries/${d}/receive`)).status).toBe(200)
    const id = (await send('POST', '/api/bar/stocktakes', { locationId: store }, counter)).body.stocktakeId
    const got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, counter)).body
    const cider = lineOf(got.lines, s.cider)
    expect(cider).toMatchObject({ fullWeightG: 30000, emptyWeightG: 10000 })
    // Two full kegs and one weighing 25 kg (three quarters full): 2 x 20 l + 15 l = 55 l, not 15 l.
    expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: [{ lineId: cider.id, weighedG: 25000, fullUnits: 2 }] }, counter)).status).toBe(200)
    const others = got.lines.filter((l: any) => l.stockItemId !== s.cider)
    if (others.length) expect((await send('POST', `/api/bar/stocktakes/${id}/counts`, { lines: others.map((l: any) => ({ lineId: l.id, notCounted: true })) }, counter)).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/submit`, undefined, counter)).status).toBe(200)
    const review = (await send('GET', `/api/bar/stocktakes/${id}`)).body
    // 5 l short of 60 l at £100 per 20 l is £25: more than the £10 above which a reason is needed.
    expect(lineOf(review.lines, s.cider)).toMatchObject({ expected: 60000, counted: 55000, varianceValueMinor: -2500 })
    expect(review.reasonOverMinor).toBe(1000)
    expect((await send('POST', `/api/bar/stocktakes/${id}/approve`)).body.code).toBe('bar.stocktake.reason-needed')
    const reason = review.reasons.find((r: any) => r.label === 'Not known').id
    expect((await send('POST', `/api/bar/stocktakes/${id}/reasons`, { lines: [{ lineId: cider.id, reasonTermId: reason }] })).status).toBe(200)
    expect((await send('POST', `/api/bar/stocktakes/${id}/approve`)).status).toBe(200)
    expect((await level(s.cider, store))!.quantity).toBe(55000)
  })

  it('counts only what a location has held when asked', async () => {
    const shelf = (await send('POST', '/api/bar/stock/locations', { name: 'Count shelf' })).body.locationId
    const d = (await send('POST', '/api/bar/stock/deliveries', { locationId: shelf, lines: [{ stockItemId: s.gin, packs: 1, looseUnits: 0 }] })).body.deliveryId
    expect((await send('POST', `/api/bar/stock/deliveries/${d}/receive`)).status).toBe(200)
    const id = (await send('POST', '/api/bar/stocktakes', { locationId: shelf, heldOnly: true }, counter)).body.stocktakeId
    expect((await send('GET', `/api/bar/stocktakes/${id}`, undefined, counter)).body.lines.map((l: any) => l.stockItemId)).toEqual([s.gin])
    expect((await send('POST', `/api/bar/stocktakes/${id}/abandon`, undefined, counter)).status).toBe(200)
    // The list says how many items in use have no category, as they are on no count by category.
    expect((await send('GET', '/api/bar/stocktakes', undefined, counter)).body.uncategorised).toBeGreaterThanOrEqual(2)
  })

  it('hides the level from counters when counts are blind', async () => {
    await commit(unit => changeSetting(unit.view(), 'bar.stocktake.blind' as never, true, { reason: 'test', confirm: true }))
    const id = (await send('POST', '/api/bar/stocktakes', { locationId: s.cellar }, counter)).body.stocktakeId
    const got = (await send('GET', `/api/bar/stocktakes/${id}`, undefined, counter)).body
    expect(got.blind).toBe(true)
    expect(got.lines.every((l: any) => l.level === null && l.expected === null)).toBe(true)
  })
})
