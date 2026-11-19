// The staff Orders list and Order page: baskets never listed, a booking reference and a buyer's name
// both find an order, filters narrow it, and the order says what the viewer may do with it.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext, person } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const viewer = person(['box-office.order.view'])
const releaser = person(['box-office.order.release'])
const stranger = person([])

async function set(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

let h: House
let other: House
let reservation: { orderId: string, reference: string }
let basketId: string

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await set('box-office.reservations.confirm-email', false)
  h = await house(20)
  const made = await buy(h, 2)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: 'ophelia.listed@example.org', name: 'Ophelia Listed' }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  const order = await req('GET', `/api/box-office/orders/${done.body.orderId}`, undefined, viewer)
  reservation = { orderId: done.body.orderId, reference: order.body.reference }
  const left = await buy(h, 1)
  if (!left.ok) throw new Error(left.code)
  basketId = left.basket.orderId
  other = await house(20)
})

describe('the Orders list', () => {
  it('lists reservations and never baskets', async () => {
    const all = await req('GET', '/api/box-office/orders?view=all', undefined, viewer)
    expect(all.status).toBe(200)
    const ids = all.body.rows.map((r: { id: string }) => r.id)
    expect(ids).toContain(reservation.orderId)
    expect(ids).not.toContain(basketId)
  })

  it('finds an order by its booking reference, typed in any case', async () => {
    const found = await req('GET', `/api/box-office/orders?view=all&q=${reservation.reference.toLowerCase()}`, undefined, viewer)
    expect(found.body.rows.map((r: { id: string }) => r.id)).toEqual([reservation.orderId])
    expect(found.body.rows[0].buyer).toBe('Ophelia Listed')
    expect(found.body.rows[0].show).toBeTruthy()
  })

  it('finds an order by the buyer\'s name', async () => {
    const found = await req('GET', '/api/box-office/orders?view=all&q=Ophelia', undefined, viewer)
    expect(found.body.rows.map((r: { id: string }) => r.id)).toContain(reservation.orderId)
  })

  it('filters by state', async () => {
    const paid = await req('GET', '/api/box-office/orders?state=confirmed', undefined, viewer)
    expect(paid.body.rows.map((r: { id: string }) => r.id)).not.toContain(reservation.orderId)
  })

  it('filters by show and by performance', async () => {
    const ids = async (filter: string) => (await req('GET', `/api/box-office/orders?view=all&${filter}`, undefined, viewer)).body.rows.map((r: { id: string }) => r.id)
    expect(await ids(`performance=${h.performanceId}`)).toEqual([reservation.orderId])
    expect(await ids(`show=${h.productionId}`)).toEqual([reservation.orderId])
    expect(await ids(`performance=${other.performanceId}`)).toEqual([])
    expect(await ids(`show=${other.productionId}`)).toEqual([])
  })

  it('offers shows and performances to filter by, and names a chosen one', async () => {
    const shows = await req('GET', '/api/box-office/productions/lookup?q=box office show', undefined, viewer)
    expect(shows.status, JSON.stringify(shows.body)).toBe(200)
    expect(shows.body.rows.map((r: { value: string }) => r.value)).toEqual(expect.arrayContaining([h.productionId, other.productionId]))
    const named = await req('GET', `/api/box-office/productions/lookup?ids=${h.productionId}`, undefined, viewer)
    const title = named.body.rows[0].label
    expect(named.body.rows).toEqual([{ value: h.productionId, label: title }])

    // Narrowed to the show that is on, and named with the show and when it starts.
    const ofShow = await req('GET', `/api/box-office/performances/lookup?q=&show=${h.productionId}`, undefined, viewer)
    expect(ofShow.body.rows.map((r: { value: string }) => r.value)).toEqual([h.performanceId])
    expect(ofShow.body.rows[0].label).toContain(title)
    const resolved = await req('GET', `/api/box-office/performances/lookup?ids=${other.performanceId}`, undefined, viewer)
    expect(resolved.body.rows.map((r: { value: string }) => r.value)).toEqual([other.performanceId])
    expect((await req('GET', '/api/box-office/performances/lookup', undefined, stranger)).status).toBe(403)
  })

  it('is refused to someone who may not see orders', async () => {
    expect((await req('GET', '/api/box-office/orders', undefined, stranger)).status).toBe(403)
  })
})

describe('the Order page', () => {
  it('shows the tickets and what the viewer may do', async () => {
    const seen = await req('GET', `/api/box-office/orders/${reservation.orderId}`, undefined, viewer)
    expect(seen.body.state).toBe('reserved')
    expect(seen.body.lines.filter((l: { kind: string }) => l.kind === 'ticket')).toHaveLength(2)
    expect(seen.body.can).toEqual({ release: false, collect: false, cancel: false, refund: false, exchange: false, comp: false, assign: false })
    expect(seen.body.payments).toEqual([])
    expect(seen.body.buyer.email).toBe('ophelia.listed@example.org')
    const asReleaser = await req('GET', `/api/box-office/orders/${reservation.orderId}`, undefined, releaser)
    expect(asReleaser.body.can.release).toBe(true)
  })

  it('does not show a basket', async () => {
    expect((await req('GET', `/api/box-office/orders/${basketId}`, undefined, viewer)).status).toBe(404)
  })
})
