// Passes as products (BO-64): staff make a pass with its own prices and what it covers, change it,
// put it on sale and retire it. A pass needs something to cover and a price; two passes cannot share
// a name; a price nobody bought goes when removed. The database keeps a pass's entries to its
// allowance and to one performance of a show, whatever the code does.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, person, rows, server } from '../../../../tests/integration/helpers'
import typesGet from '../../server/api/box-office/pass-types/index.get'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import typePut from '../../server/api/box-office/pass-types/[id].put'
import typeState from '../../server/api/box-office/pass-types/[id]/state.post'
import { buy, house, NOV_16, ready, type House } from './stage'

const handle = server({
  'GET /api/box-office/pass-types': typesGet,
  'POST /api/box-office/pass-types': typesPost,
  'PUT /api/box-office/pass-types/:id': typePut,
  'POST /api/box-office/pass-types/:id/state': typeState,
})
const staff = person(['box-office.pass.manage'])
let keys = 0
async function api<T = any>(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> | undefined = staff): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': `pty${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

const exec = (sql: string, ...params: unknown[]) => env.DB.prepare(sql).bind(...params).run()

let h: House
let names = 0
const pass = (fields: Record<string, unknown> = {}) => ({
  name: `Season pass ${++names}`, covers: 'productions', productionIds: [h.productionId], perShow: 'once',
  prices: [{ name: 'Adult', amountMinor: 3500 }, { name: 'Member', amountMinor: 2100 }],
  ...fields,
})
const listed = async (id: string) => (await api('GET', '/api/box-office/pass-types')).body.rows.find((r: { id: string }) => r.id === id)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(20)
})

describe('setting up a pass', () => {
  it('is made with its own prices and the shows it covers, off sale until put on', async () => {
    const made = await api('POST', '/api/box-office/pass-types', pass({ name: 'Autumn Season Pass' }))
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const row = await listed(made.body.id)
    expect(row).toMatchObject({ name: 'Autumn Season Pass', covers: 'productions', productionIds: [h.productionId], perShow: 'once', uses: null, holder: 'auto', reserveUnpaid: true, recheck: false, onSale: false, active: true, held: 0 })
    expect(row.prices.map((p: { name: string, amountMinor: number }) => [p.name, p.amountMinor])).toEqual([['Adult', 3500], ['Member', 2100]])
    // The show it covers is offered to choose from, by its title.
    const listing = (await api('GET', '/api/box-office/pass-types')).body
    expect(listing.productions.some((p: { id: string }) => p.id === h.productionId)).toBe(true)

    expect((await api('POST', `/api/box-office/pass-types/${made.body.id}/state`, { onSale: true })).status).toBe(200)
    expect((await listed(made.body.id)).onSale).toBe(true)
  })

  it('needs something to cover, a price, and a name of its own', async () => {
    const none = await api('POST', '/api/box-office/pass-types', pass({ productionIds: [] }))
    expect([none.status, none.body.code, Object.keys(none.body.fields)]).toEqual([422, 'box-office.pass.no-shows', ['productionIds']])
    const season = await api('POST', '/api/box-office/pass-types', pass({ covers: 'season', productionIds: undefined }))
    expect([season.status, season.body.code]).toEqual([422, 'box-office.pass.no-season'])
    const dates = await api('POST', '/api/box-office/pass-types', pass({ covers: 'dates', coversFrom: NOV_16 + 1000, coversUntil: NOV_16 }))
    expect([dates.status, dates.body.code]).toEqual([422, 'box-office.pass.window'])
    expect((await api('POST', '/api/box-office/pass-types', pass({ prices: [] }))).status).toBe(422)
    const twice = await api('POST', '/api/box-office/pass-types', pass({ prices: [{ name: 'Adult', amountMinor: 1 }, { name: 'adult', amountMinor: 2 }] }))
    expect([twice.status, twice.body.code, twice.body.fields]).toEqual([422, 'box-office.pass.price-twice', { 'prices.1.name': 'Choose another name.' }])
    const unknown = await api('POST', '/api/box-office/pass-types', pass({ prices: [{ name: 'Member', amountMinor: 1, requirementRefs: ['nobody.provides:this'] }] }))
    expect([unknown.status, unknown.body.code]).toEqual([422, 'box-office.pass.unknown-requirement'])

    const first = pass()
    expect((await api('POST', '/api/box-office/pass-types', first)).status).toBe(200)
    const again = await api('POST', '/api/box-office/pass-types', { ...first, name: first.name.toUpperCase() })
    expect([again.status, again.body.code]).toEqual([409, 'box-office.pass.name-taken'])
  })

  it('is changed: a price renamed keeps its id, one removed and never sold goes, and cover is replaced', async () => {
    const other = await house(10)
    const made = await api('POST', '/api/box-office/pass-types', pass())
    const before = await listed(made.body.id)
    const [adult, member] = before.prices
    const put = await api('PUT', `/api/box-office/pass-types/${made.body.id}`, {
      name: before.name, covers: 'productions', productionIds: [other.productionId], perShow: 'any', uses: 6, holder: 'named', reserveUnpaid: false, recheck: true, channel: 'desk',
      prices: [{ id: adult.id, name: 'Full', amountMinor: 4000 }, { name: 'Student', amountMinor: 2800 }],
    })
    expect(put.status, JSON.stringify(put.body)).toBe(200)
    const after = await listed(made.body.id)
    expect(after).toMatchObject({ productionIds: [other.productionId], perShow: 'any', uses: 6, holder: 'named', reserveUnpaid: false, recheck: true, channel: 'desk' })
    expect(after.prices.map((p: { id: string, name: string }) => p.name)).toEqual(['Full', 'Student'])
    expect(after.prices[0].id).toBe(adult.id)
    expect(await rows('SELECT 1 FROM box_office_pass_prices WHERE id = ?', member.id)).toEqual([])
  })

  it('keeps, retired, a price a pass was sold at; and is itself retired and brought back', async () => {
    const made = await api('POST', '/api/box-office/pass-types', pass())
    const before = await listed(made.body.id)
    const member = before.prices[1]
    await exec('INSERT INTO box_office_passes (id, pass_type_id, pass_price_id, code_hash, amount_minor, currency, created_at, updated_at) VALUES (?, ?, ?, ?, 2100, \'GBP\', ?, ?)', newId('pass'), made.body.id, member.id, `hash-${member.id}`, nowMs(), nowMs())
    const put = await api('PUT', `/api/box-office/pass-types/${made.body.id}`, { name: before.name, covers: 'productions', productionIds: [h.productionId], perShow: 'once', prices: [{ id: before.prices[0].id, name: 'Adult', amountMinor: 3500 }] })
    expect(put.status, JSON.stringify(put.body)).toBe(200)
    const after = await listed(made.body.id)
    expect(after.prices.map((p: { name: string, active: boolean, sold: number }) => [p.name, p.active, p.sold])).toEqual([['Adult', true, 0], ['Member', false, 1]])
    expect([after.held, after.unpaid]).toEqual([1, 1])

    expect((await api('POST', `/api/box-office/pass-types/${made.body.id}/state`, { active: false })).status).toBe(200)
    expect((await listed(made.body.id)).active).toBe(false)
    // A retired pass is not put on sale.
    expect((await api('POST', `/api/box-office/pass-types/${made.body.id}/state`, { onSale: true })).status).toBe(409)
    expect((await api('POST', `/api/box-office/pass-types/${made.body.id}/state`, { active: true })).status).toBe(200)
  })

  it('is for staff who may set passes up', async () => {
    expect((await api('GET', '/api/box-office/pass-types', undefined, person(['box-office.promo.manage']))).status).toBe(403)
    expect((await api('POST', '/api/box-office/pass-types', pass(), person(['box-office.order.view']))).status).toBe(403)
  })
})

describe('the database, on a pass\'s entries', () => {
  // pass-last-use-given-once: the allowance and the one-performance rules hold whatever the code does.
  it('gives the last entry once, one entry a performance, and one performance of a show; a seat given back gives the entry back', async () => {
    const made = await api('POST', '/api/box-office/pass-types', pass())
    const price = (await listed(made.body.id)).prices[0]
    const passId = newId('pass')
    const at = nowMs()
    await exec('INSERT INTO box_office_passes (id, pass_type_id, pass_price_id, code_hash, uses_total, once, amount_minor, currency, created_at, updated_at) VALUES (?, ?, ?, ?, 2, 1, 3500, \'GBP\', ?, ?)', passId, made.body.id, price.id, `hash-${passId}`, at, at)
    const a = await buy(h, 2)
    const b = await buy(await house(10), 1)
    const c = await buy(await house(10), 1)
    if (!a.ok || !b.ok || !c.ok) throw new Error('no basket')
    const claim = async (orderId: string, i = 0) => (await rows<{ claim_id: string, performance_id: string }>('SELECT claim_id, performance_id FROM box_office_order_lines WHERE order_id = ? ORDER BY id', orderId))[i]!
    const enter = async (orderId: string, productionId: string, i = 0) => {
      const line = await claim(orderId, i)
      return exec('INSERT INTO box_office_pass_redemptions (id, pass_id, production_id, performance_id, order_id, claim_id, once, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, \'live\', ?, ?)', newId('pred'), passId, productionId, line.performance_id, orderId, line.claim_id, at, at)
    }
    const taken = async () => (await rows<{ uses_taken: number }>('SELECT uses_taken FROM box_office_passes WHERE id = ?', passId))[0]!.uses_taken

    await enter(a.basket.orderId, h.productionId)
    expect(await taken()).toBe(1)
    // A second entry at the same performance, and so of the same show, is refused.
    await expect(enter(a.basket.orderId, h.productionId, 1)).rejects.toThrow()
    await enter(b.basket.orderId, 'another-show')
    expect(await taken()).toBe(2)
    // The allowance is two.
    await expect(enter(c.basket.orderId, 'a-third-show')).rejects.toThrow()
    expect(await taken()).toBe(2)

    // The first seat is given back, and with it the entry.
    const first = await claim(a.basket.orderId)
    await exec('UPDATE box_office_claims SET state = \'released\', released_at = ?, release_reason = \'staff\' WHERE id = ?', at, first.claim_id)
    expect(await taken()).toBe(1)
    expect(await rows('SELECT state FROM box_office_pass_redemptions WHERE claim_id = ?', first.claim_id)).toEqual([{ state: 'released' }])
    await enter(c.basket.orderId, 'a-third-show')
    expect(await taken()).toBe(2)
    await expect(exec('DELETE FROM box_office_pass_redemptions WHERE pass_id = ?', passId)).rejects.toThrow()
  })
})
