// Putting a show on sale (BO-01, BO-03, BO-04, BO-05; Box office specification, part 3, "A
// performance on sale"): the checklist names what is missing, going on sale is refused until it is
// there, a price change leaves existing baskets alone, capacity cannot go below what is claimed or
// above the space without someone who may say so, and a paused performance takes no new baskets.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, setClock } from '#kit'
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

  it('renames a band, and removes one only while nothing is priced or sold in it', async () => {
    const h = await house(10)
    const bands = `/api/box-office/productions/${h.productionId}/bands`
    const spare = await req('POST', bands, { name: 'Gallery' })
    expect(spare.status, JSON.stringify(spare.body)).toBe(200)
    expect((await req('PATCH', `${bands}/${spare.body.bandId}`, { name: 'Upper circle' })).status).toBe(200)
    // Two bands may not share a name.
    expect((await req('PATCH', `${bands}/${spare.body.bandId}`, { name: 'Stalls' })).body.code).toBe('box-office.band.name-taken')
    expect((await req('GET', bands)).body.bands.map((b: { name: string }) => b.name)).toContain('Upper circle')
    // Stalls is priced, so it stays; the new band has nothing in it, so it goes.
    expect((await req('DELETE', `${bands}/${h.bandId}`)).body.code).toBe('box-office.band.in-use')
    expect((await req('DELETE', `${bands}/${spare.body.bandId}`)).status).toBe(200)
    expect((await req('GET', bands)).body.bands.map((b: { name: string }) => b.name)).toEqual(['Stalls'])
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

describe('copying a set-up from another performance', () => {
  const copy = (to: string, from: string, body: Record<string, unknown> = {}) => req('POST', `/api/box-office/performances/${to}/sales/copy`, { fromPerformanceId: from, ...body })
  const layers = async (performanceId: string) => (await sales(performanceId)).body.priceLayers as { bandId: string, ticketTypeId: string, production: number | null, own: { amountMinor: number | null } | null }[]

  it('from another production: matches bands by name, adds the rest, and copies capacities, prices and limits but no sales', async () => {
    const source = await house(10)
    const circle = await req('POST', `/api/box-office/productions/${source.productionId}/bands`, { name: 'Circle', sort: 1 })
    await req('PUT', `/api/box-office/performances/${source.performanceId}/sales`, { pools: [{ bandId: circle.body.bandId, capacity: 6 }], maxPerOrder: 4 })
    await req('POST', `/api/box-office/productions/${source.productionId}/prices`, { prices: [{ bandId: circle.body.bandId, ticketTypeId: source.fullId, amountMinor: 900 }] })
    expect((await buy(source, 2)).ok).toBe(true)
    const target = await house(5, { open: false })

    expect((await req('GET', `/api/box-office/performances/${target.performanceId}/sales/sources`)).body.performances.map((p: { id: string }) => p.id)).toContain(source.performanceId)
    const done = await copy(target.performanceId, source.performanceId)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toEqual({ bands: 1, pools: 2, prices: 3 })

    const after = (await sales(target.performanceId)).body
    expect(after.pools.map((p: any) => [p.bandName, p.capacity, p.claimed])).toEqual([['Stalls', 10, 0], ['Circle', 6, 0]])
    expect(after.sales).toMatchObject({ maxPerOrder: 4 })
    // The production had no prices, so the copied ones are the production's.
    const circleHere = after.bands.find((b: any) => b.name === 'Circle').id
    expect(await layers(target.performanceId)).toEqual(expect.arrayContaining([
      { bandId: target.bandId, ticketTypeId: target.fullId, production: 1200, own: null },
      { bandId: target.bandId, ticketTypeId: target.concessionId, production: 800, own: null },
      { bandId: circleHere, ticketTypeId: target.fullId, production: 900, own: null },
    ]))
    expect(missing(after)).toEqual([])
  })

  it('within a production: a price that differs becomes this performance\'s own, and the others keep theirs', async () => {
    const source = await house(8)
    const venue = await req('POST', '/api/core/venues', { name: 'Copy venue' })
    const second = await req('POST', `/api/core/productions/${source.productionId}/performances`, { venueId: venue.body.venueId, spaceId: venue.body.spaceId, startsAt: Date.UTC(2027, 3, 1, 19, 30), capacity: 500 })
    await req('POST', `/api/core/performances/${second.body.id}/schedule`, {})
    // The production's own performance is offered first, ahead of any other production's.
    const offered = (await req('GET', `/api/box-office/performances/${second.body.id}/sales/sources`)).body.performances
    expect(offered[0]).toMatchObject({ id: source.performanceId, productionId: source.productionId, sameProduction: true })
    setClock(NOV_16 + 1000)
    await req('POST', `/api/box-office/productions/${source.productionId}/prices`, { prices: [{ bandId: source.bandId, ticketTypeId: source.fullId, performanceId: source.performanceId, amountMinor: 700 }] })
    expect((await copy(second.body.id, source.performanceId)).body).toEqual({ bands: 0, pools: 1, prices: 1 })
    expect((await layers(second.body.id)).find(l => l.ticketTypeId === source.fullId)).toMatchObject({ production: 1200, own: { amountMinor: 700 } })
    setClock(NOV_16)
  })

  it('refuses itself, and a performance with nothing set up', async () => {
    const h = await house(4, { open: false })
    expect((await copy(h.performanceId, h.performanceId)).body).toMatchObject({ code: 'box-office.copy.same' })
    const venue = (await req('POST', '/api/core/venues', { name: 'Bare venue' })).body
    const bare = await req('POST', `/api/core/productions/${h.productionId}/performances`, { venueId: venue.venueId, spaceId: venue.spaceId, startsAt: Date.UTC(2027, 4, 1, 19, 30), capacity: 100 })
    expect(bare.status, JSON.stringify(bare.body)).toBe(200)
    expect((await copy(h.performanceId, bare.body.id)).body).toMatchObject({ code: 'box-office.copy.nothing' })
  })
})

describe('price changes set for later', () => {
  const DAY = 86_400_000 // not-policy: a day in milliseconds
  const prices = (productionId: string, body: Record<string, unknown>) => req('POST', `/api/box-office/productions/${productionId}/prices`, body)

  it('keeps the current price until the moment set, lists the change meanwhile, and can cancel it', async () => {
    setClock(NOV_16)
    const h = await house(10)
    const later = NOV_16 + 3 * DAY
    // An early-bird price ends: the full price rises in three days, for every performance.
    const set = await prices(h.productionId, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 1500 }], from: later })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    const before = (await sales(h.performanceId)).body
    expect(before.priceLayers.find((l: any) => l.ticketTypeId === h.fullId)).toMatchObject({ production: 1200 })
    expect(before.scheduledPrices).toEqual([{ bandId: h.bandId, ticketTypeId: h.fullId, performanceId: null, amountMinor: 1500, inherits: false, from: later }])
    const bought = await buy(h, 1)
    expect(bought.ok && bought.basket.totalMinor).toBe(1200)

    // A second change, for this performance alone, is cancelled: nothing changes then.
    const own = NOV_16 + 2 * DAY
    await prices(h.productionId, { prices: [{ bandId: h.bandId, ticketTypeId: h.concessionId, performanceId: h.performanceId, amountMinor: 500 }], from: own })
    expect((await sales(h.performanceId)).body.scheduledPrices).toHaveLength(2)
    const cancelled = await req('POST', `/api/box-office/productions/${h.productionId}/prices/cancel-scheduled`, { bandId: h.bandId, ticketTypeId: h.concessionId, performanceId: h.performanceId, from: own })
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect((await sales(h.performanceId)).body.scheduledPrices.map((s: any) => s.ticketTypeId)).toEqual([h.fullId])
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices/cancel-scheduled`, { bandId: h.bandId, ticketTypeId: h.concessionId, performanceId: h.performanceId, from: own })).body).toMatchObject({ code: 'box-office.price.nothing-scheduled' })

    advanceClock(3 * DAY)
    const after = (await sales(h.performanceId)).body
    expect(after.priceLayers.find((l: any) => l.ticketTypeId === h.fullId)).toMatchObject({ production: 1500 })
    expect(after.priceLayers.find((l: any) => l.ticketTypeId === h.concessionId)).toMatchObject({ production: 800, own: null })
    expect(after.scheduledPrices).toEqual([])
    const rebought = await buy(h, 1)
    expect(rebought.ok && rebought.basket.totalMinor).toBe(1500)
    setClock(NOV_16)
  })

  it('refuses a moment that has already passed', async () => {
    const h = await house(10)
    expect((await prices(h.productionId, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 900 }], from: NOV_16 - 1 })).body).toMatchObject({ code: 'box-office.price.from-past' })
  })
})
