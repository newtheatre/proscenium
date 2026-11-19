// Unpaid reservations on the night (Matt, 2026-11-18): released by default ten minutes before the
// start, or at a performance's own time; the door can release them all at once; and a released
// booking is kept, found at the till, and seated again only if seats are still free.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import releaseUnpaid from '../../server/api/box-office/performances/[id]/door/release-unpaid.post'
import reinstatePost from '../../server/api/box-office/orders/[id]/reinstate.post'
import { findOrders } from '../../server/desk'
import { scan } from '../../server/door'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const handle = server({
  'POST /api/box-office/performances/:id/door/release-unpaid': releaseUnpaid,
  'POST /api/box-office/orders/:id/reinstate': reinstatePost,
})
const door = person(['box-office.order.release', 'box-office.ticket.admit'])
const seller = person(['box-office.order.sell', 'box-office.order.view'])
let keys = 0
async function api<T = any>(path: string, actor: ReturnType<typeof person>): Promise<{ status: number, body: T }> {
  const response = await call(handle, 'POST', path, { actor, body: {}, headers: { 'idempotency-key': `ns${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

let guests = 0
async function reserved(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(`no basket: ${made.code}`)
  const b = made.basket
  const done = await req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: b.totalMinor, email: `noshow${++guests}@example.org`, name: 'No Show' }, null, { 'x-basket-token': b.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  return done.body as { orderId: string, reference: string, releaseAt: number }
}
const order = async (id: string) => (await rows<Record<string, any>>('SELECT state, release_at, keep FROM box_office_orders WHERE id = ?', id))[0]!
const claimed = async (h: House) => (await rows<{ claimed: number }>('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!.claimed
const startOf = async (h: House) => (await rows<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', h.performanceId))[0]!.starts_at

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('the release time', () => {
  it('is ten minutes before the start unless the performance sets its own, which moves reservations already made', async () => {
    const h = await house(10)
    const start = await startOf(h)
    const r = await reserved(h, 1)
    expect(r.releaseAt).toBe(start - 10 * 60_000)
    const set = await req('PUT', `/api/box-office/performances/${h.performanceId}/sales`, { releaseMinutes: 5 })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect((await order(r.orderId)).release_at).toBe(start - 5 * 60_000)
    expect((await reserved(h, 1)).releaseAt).toBe(start - 5 * 60_000)
  })
})

describe('releasing no-shows at the door', () => {
  it('lets every unpaid reservation go at once, leaving one marked to keep', async () => {
    const h = await house(10)
    const a = await reserved(h, 2)
    const b = await reserved(h, 1)
    const kept = await reserved(h, 1)
    expect((await req('POST', `/api/box-office/orders/${kept.orderId}/keep`, { keep: true }, door)).status).toBe(200)
    expect(await claimed(h)).toBe(4)
    const done = await api(`/api/box-office/performances/${h.performanceId}/door/release-unpaid`, door)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect([...done.body.released].sort()).toEqual([a.orderId, b.orderId].sort())
    expect(await claimed(h)).toBe(1)
    expect((await order(a.orderId)).state).toBe('expired')
    expect((await order(kept.orderId)).state).toBe('reserved')
    expect((await api(`/api/box-office/performances/${h.performanceId}/door/release-unpaid`, person(['box-office.ticket.admit']))).status).toBe(403)
  })

  it('says a released booking was released when its reference is scanned, so the till can seat them again', async () => {
    const h = await house(10)
    const r = await reserved(h, 1)
    expect((await api(`/api/box-office/performances/${h.performanceId}/door/release-unpaid`, door)).status).toBe(200)
    const said = await inContext(() => scan({ performanceId: h.performanceId, code: r.reference.toLowerCase() }), door)
    expect(said).toMatchObject({ result: 'released', scanId: null, reservation: { reference: r.reference } })
  })
})

describe('a released booking', () => {
  it('is found at the till, and seated again on free seats, kept from the next release', async () => {
    const h = await house(10)
    const r = await reserved(h, 2)
    await api(`/api/box-office/performances/${h.performanceId}/door/release-unpaid`, door)
    const [found] = await inContext(() => findOrders(r.reference))
    expect(found).toMatchObject({ orderId: r.orderId, state: 'expired', released: true })
    expect(found!.lines).toHaveLength(2)

    const back = await api(`/api/box-office/orders/${r.orderId}/reinstate`, seller)
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect(await order(r.orderId)).toMatchObject({ state: 'reserved', release_at: null, keep: 1 })
    expect(await claimed(h)).toBe(2)
    expect(await rows('SELECT state, count(*) AS n FROM box_office_order_lines WHERE order_id = ? GROUP BY state ORDER BY state', r.orderId)).toEqual([{ state: 'exchanged', n: 2 }, { state: 'live', n: 2 }])
    // Only a released booking can be seated again.
    expect((await api(`/api/box-office/orders/${r.orderId}/reinstate`, seller)).body.code).toBe('box-office.order.not-released')
  })

  it('is not seated again once the seats have been sold', async () => {
    const h = await house(2)
    const r = await reserved(h, 2)
    await api(`/api/box-office/performances/${h.performanceId}/door/release-unpaid`, door)
    expect((await buy(h, 2)).ok).toBe(true)
    const back = await api(`/api/box-office/orders/${r.orderId}/reinstate`, seller)
    expect(back.status).toBe(409)
    expect((await order(r.orderId)).state).toBe('expired')
    expect(await claimed(h)).toBe(2)
  })
})
