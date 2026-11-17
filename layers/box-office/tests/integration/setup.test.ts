// Putting a show on sale (BO-01, BO-03, BO-04, BO-05; Box office specification, part 3, "A
// performance on sale"): the checklist names what is missing, going on sale is refused until it is
// there, a price change leaves existing baskets alone, capacity cannot go below what is claimed or
// above the space without someone who may say so, and a paused performance takes no new baskets.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { env, person, rows } from '../../../../tests/integration/helpers'
import { buy, house, manager, NOV_16, ready, req } from './stage'

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

const sales = (performanceId: string) => req('GET', `/api/box-office/performances/${performanceId}/sales`)
const missing = (body: any) => body.checklist.filter((i: any) => !i.done).map((i: any) => i.code)

describe('setting a performance up for sale', () => {
  it('needs the ability, on every route that changes or shows the set-up', async () => {
    const h = await house(10)
    const nobody = person([])
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { pools: [] }, nobody)).status).toBe(403)
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/sales`, undefined, nobody)).status).toBe(403)
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/pause`, {}, nobody)).status).toBe(403)
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1 }] }, nobody)).status).toBe(403)
    expect((await req('POST', '/api/box-office/ticket-types', { name: 'Sneaky' }, nobody)).status).toBe(403)
  })

  it('names what is missing and refuses to go on sale until a band has a price', async () => {
    const h = await house(40, { open: false })
    expect(missing((await sales(h.performanceId)).body)).toEqual(['prices'])
    const early = await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})
    expect(early).toMatchObject({ status: 409, body: { code: 'box-office.sales.needs-prices' } })
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.sales.not-yet' })

    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1200 }] })
    const ready = (await sales(h.performanceId)).body
    expect(missing(ready)).toEqual([])
    expect(ready).toMatchObject({ sales: { state: 'draft' }, houseCapacity: 500, pools: [{ capacity: 40, claimed: 0 }], prices: [{ amountMinor: 1200 }] })
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})).body).toEqual({ state: 'on_sale' })
    expect(await rows("SELECT id FROM core_events WHERE name = 'box-office.performance.opened' AND record_id = ?", h.performanceId)).toHaveLength(1)
    // Already on sale: the transition is guarded on the statement.
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})).body.code).toBe('box-office.sales.not-ready')
  })

  it('refuses to go on sale with no capacity, and once a price is withdrawn', async () => {
    const h = await house(0, { open: false })
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1200 }] })
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})).body.code).toBe('box-office.sales.needs-capacity')
    await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { pools: [{ bandId: h.bandId, capacity: 5 }] })
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: null }] })
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})).body.code).toBe('box-office.sales.needs-prices')
  })

  it('takes no new baskets while paused, and sells again when resumed', async () => {
    const h = await house(10)
    expect(await buy(h, 1)).toMatchObject({ ok: true })
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/pause`, {})).body).toEqual({ state: 'paused' })
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.sales.paused', reason: 'Sales are paused for this performance.' })
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/open`, {})).status).toBe(200)
    expect(await buy(h, 1)).toMatchObject({ ok: true })
  })

  it('gives a new basket the new price and leaves an existing basket its own', async () => {
    const h = await house(10)
    const before = await buy(h, 2)
    setClock(NOV_16 + 1000)
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1500 }] })
    const after = await buy(h, 2)
    expect(before).toMatchObject({ ok: true, basket: { totalMinor: 2400 } })
    expect(after).toMatchObject({ ok: true, basket: { totalMinor: 3000 } })
    const kept = await rows<{ amount_minor: number }>('SELECT amount_minor FROM box_office_order_lines WHERE order_id = ?', (before as any).basket.orderId)
    expect(kept.map(l => l.amount_minor)).toEqual([1200, 1200])
    // The history shows who changed it and when.
    const history = await rows<{ amount_minor: number, set_by: string, effective_from: number }>('SELECT amount_minor, set_by, effective_from FROM box_office_prices WHERE band_id = ? AND ticket_type_id = ? ORDER BY effective_from', h.bandId, h.fullId)
    expect(history).toMatchObject([{ amount_minor: 1200, set_by: manager.accountId }, { amount_minor: 1500, set_by: manager.accountId, effective_from: NOV_16 + 1000 }])
    setClock(NOV_16)
  })

  it('lets one performance have its own price, which a later price for the whole production does not replace', async () => {
    const h = await house(10)
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, performanceId: h.performanceId, amountMinor: 500 }] })
    setClock(NOV_16 + 2000)
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 2000 }] })
    expect(await buy(h, 1)).toMatchObject({ ok: true, basket: { totalMinor: 500 } })
    setClock(NOV_16)
  })

  it('shows where each price comes from, and hands a performance\'s own price back to the production\'s', async () => {
    const h = await house(10)
    const price = (body: Record<string, unknown>) => req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, ...body }] })
    const layer = async () => (await sales(h.performanceId)).body.priceLayers.find((l: any) => l.ticketTypeId === h.fullId)
    // The house already charges 1200 for every performance.
    expect(await layer()).toEqual({ bandId: h.bandId, ticketTypeId: h.fullId, production: 1200, own: null })

    setClock(NOV_16 + 1000)
    expect((await price({ performanceId: h.performanceId, amountMinor: 800 })).status).toBe(200)
    expect(await layer()).toMatchObject({ production: 1200, own: { amountMinor: 800 } })
    expect(await buy(h, 1)).toMatchObject({ ok: true, basket: { totalMinor: 800 } })

    // Not sold at this performance only: the rest still sell it.
    setClock(NOV_16 + 2000)
    await price({ performanceId: h.performanceId, amountMinor: null })
    expect(await layer()).toMatchObject({ production: 1200, own: { amountMinor: null } })
    expect((await sales(h.performanceId)).body.prices.find((p: any) => p.ticketTypeId === h.fullId)).toBeUndefined()

    // Back to the production's, which then follows the production's later changes.
    setClock(NOV_16 + 3000)
    expect((await price({ performanceId: h.performanceId, amountMinor: null, inherit: true })).status).toBe(200)
    expect(await layer()).toMatchObject({ production: 1200, own: null })
    setClock(NOV_16 + 4000)
    await price({ amountMinor: 1500 })
    expect(await layer()).toMatchObject({ production: 1500, own: null })
    expect(await buy(h, 1)).toMatchObject({ ok: true, basket: { totalMinor: 1500 } })

    // Going back needs a performance, and the performance must be this production's.
    expect((await price({ amountMinor: null, inherit: true })).body).toMatchObject({ code: 'box-office.price.inherit-needs-performance' })
    const other = await house(5)
    expect((await price({ performanceId: other.performanceId, amountMinor: 100 })).body).toMatchObject({ code: 'box-office.performance.not-found' })
    setClock(NOV_16)
  })
})

describe('capacity', () => {
  it('cannot be cut below the seats already claimed, and says how many', async () => {
    const h = await house(10)
    await buy(h, 4)
    const cut = await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { pools: [{ bandId: h.bandId, capacity: 3 }] })
    expect(cut).toMatchObject({ status: 409, body: { code: 'box-office.capacity.below-claimed' } })
    expect(cut.body.reason).toContain('4 seats')
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { pools: [{ bandId: h.bandId, capacity: 4 }] })).status).toBe(200)
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.capacity.sold-out' })
  })

  it('above the space needs someone who may exceed it, saying so, and records who', async () => {
    const h = await house(50, { houseCapacity: 60 })
    const over = { pools: [{ bandId: h.bandId, capacity: 61 }] }
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, over)).body.code).toBe('box-office.capacity.over-venue')
    const senior = person(['box-office.performance.manage', 'box-office.performance.exceed-venue'])
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, over, senior)).body.code).toBe('box-office.capacity.confirm-over-venue')
    expect((await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { ...over, confirmOverVenue: true }, senior)).status).toBe(200)
    expect(await rows('SELECT capacity, over_venue_confirmed_by FROM box_office_pools WHERE performance_id = ?', h.performanceId)).toEqual([{ capacity: 61, over_venue_confirmed_by: senior.accountId }])
  })
})

describe('a basket', () => {
  it('is held through the public route with no account, and opened again only with its token', async () => {
    const h = await house(10)
    // With a challenge secret set, a basket needs the challenge passed.
    ;(env as any).CORE_TURNSTILE_SECRET_KEY = 'set'
    expect((await req('POST', '/api/box-office/baskets', { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }] }, null)).body.code).toBe('core.challenge.failed')
    ;(env as any).CORE_TURNSTILE_SECRET_KEY = ''
    const made = await req('POST', '/api/box-office/baskets', { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }, { bandId: h.bandId, ticketTypeId: h.concessionId, quantity: 1 }] }, null)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body).toMatchObject({ totalMinor: 3200, currency: 'GBP', expiresAt: NOV_16 + 10 * 60_000 })
    expect(made.body.reference).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/)
    expect(made.body.lines).toHaveLength(3)
    const order = (await rows<any>('SELECT * FROM box_office_orders WHERE id = ?', made.body.orderId))[0]
    expect(order).toMatchObject({ state: 'basket', channel: 'online', account_id: null, total_minor: 3200 })
    // The token is stored only as its hash.
    expect(order.link_token_hash).not.toBe(made.body.token)
    expect(JSON.stringify(order)).not.toContain(made.body.token)

    expect((await req('GET', `/api/box-office/baskets/${made.body.orderId}`, undefined, null)).status).toBe(404)
    expect((await req('GET', `/api/box-office/baskets/${made.body.orderId}`, undefined, null, { 'x-basket-token': 'guess' })).status).toBe(404)
    const mine = await req('GET', `/api/box-office/baskets/${made.body.orderId}`, undefined, null, { 'x-basket-token': made.body.token })
    expect(mine.body).toMatchObject({ state: 'basket', totalMinor: 3200 })
    expect(mine.body.lines).toHaveLength(3)

    // Once the hold has run out the basket holds nothing and says so.
    setClock(NOV_16 + 10 * 60_000)
    expect((await req('GET', `/api/box-office/baskets/${made.body.orderId}`, undefined, null, { 'x-basket-token': made.body.token })).body).toMatchObject({ state: 'expired', totalMinor: 0, lines: [] })
    setClock(NOV_16)
  })

  it('is refused above the order cap, and for a ticket that has no price here', async () => {
    const h = await house(20)
    expect(await buy(h, 9)).toMatchObject({ ok: false, code: 'box-office.order.too-many' })
    await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { maxPerOrder: 12, holdMinutes: 3 })
    expect(await buy(h, 9)).toMatchObject({ ok: true, basket: { expiresAt: NOV_16 + 3 * 60_000 } })
    const other = await house(5)
    expect(await buy(h, 0, [{ bandId: other.bandId, ticketTypeId: h.fullId, quantity: 1 }])).toMatchObject({ ok: false, code: 'box-office.price.none' })
  })

  it('is refused once online sales have closed', async () => {
    const h = await house(5, { startsAt: NOV_16 + 60 * 60_000 })
    expect(await buy(h, 1)).toMatchObject({ ok: true })
    await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { offSaleAt: NOV_16 - 1 })
    expect(await buy(h, 1)).toMatchObject({ ok: false, code: 'box-office.sales.closed' })
  })
})

describe('availability', () => {
  it('tells anyone what is on sale and for how much, never how many', async () => {
    const h = await house(1)
    const open = await req('GET', `/api/box-office/availability/${h.performanceId}`, undefined, null)
    expect(open.body).toMatchObject({ state: 'on_sale', currency: 'GBP', bands: [{ name: 'Stalls', available: true, lowestMinor: 800 }] })
    expect(JSON.stringify(open.body)).not.toMatch(/capacity|claimed|free/)
    await buy(h, 1)
    expect((await req('GET', `/api/box-office/availability/${h.performanceId}`, undefined, null)).body.bands[0].available).toBe(false)
    const unsold = await req('GET', '/api/box-office/availability/perf_00000000000000000000000000', undefined, null)
    expect(unsold.body).toMatchObject({ state: 'none', bands: [] })
  })
})
