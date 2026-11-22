// The sales report: counts and face value for one production by performance, ticket type and
// channel, with reservations and complimentary tickets apart; only the productions the person may
// see; and the CSV for someone who may export.
import { beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { cache, createUnit, first, setClock } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { confirmOrder } from '../../server/confirm'
import { liveLines, ORDER, type OrderRow } from '../../server/orders'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person } from '../../../../tests/integration/helpers'
import { buy, handle, house, NOV_16, ready, req, type House } from './stage'

let h: House
let other: House
let buyers = 0
const reader = () => person(['box-office.report.view'])

/** A basket confirmed or reserved straight through the services, as checkout and reserving would. */
async function sold(target: House, quantity: number, state: 'confirmed' | 'reserved', ticketTypeId = target.fullId): Promise<void> {
  const made = await buy(target, quantity, [{ bandId: target.bandId, ticketTypeId, quantity }])
  if (!made.ok) throw new Error(made.code)
  await inContext(async () => {
    const unit = createUnit()
    const { accountId } = await findOrCreateAccount(unit.view(), { address: `report${++buyers}@example.org`, origin: 'guest' })
    const order = (await first<OrderRow>(`${ORDER} WHERE id = ?`, made.basket.orderId))!
    if (state === 'confirmed') await confirmOrder(unit.view(), order, await liveLines(order.id), { from: 'basket', account: { id: accountId, signedIn: false } })
    else unit.add(sql`UPDATE box_office_orders SET state = 'reserved', account_id = ${accountId}, reserved_at = ${order.expires_at} WHERE id = ${order.id}`)
    await unit.commit()
  })
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(() => cache.put('box-office:site-origin', 'https://theatre.example'))
  h = await house(40)
  other = await house(10)
  await sold(h, 3, 'confirmed')
  await sold(h, 2, 'confirmed', h.concessionId)
  await sold(h, 1, 'reserved')
  await buy(h, 4) // a basket nobody checked out is not a sale
})

describe('the sales report', () => {
  it('counts sold, reserved and face value by performance, ticket type and channel', async () => {
    const seen = await req('GET', `/api/box-office/reports/sales?productionId=${h.productionId}`, undefined, reader())
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    const report = seen.body.report
    expect(report.performances).toHaveLength(1)
    expect(report.performances[0]).toMatchObject({ id: h.performanceId, capacity: 40, sold: 5, reserved: 1, complimentary: 0, valueMinor: 3 * 1200 + 2 * 800 })
    expect(report.byType.map((r: { name: string, tickets: number }) => [r.name, r.tickets])).toEqual([['Full price', 3], ['Concession', 2]])
    expect(report.byChannel).toEqual([{ channel: 'online', tickets: 5, valueMinor: 5200 }])
    expect(seen.body.productions.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([h.productionId, other.productionId]))
    expect(seen.body.canExport).toBe(false)
  })

  it('opens on the production whose performance is nearest to now when none is asked for', async () => {
    const soon = await house(10, { startsAt: NOV_16 + 3_600_000 })
    const seen = await req('GET', '/api/box-office/reports/sales', undefined, reader())
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.report.production.id).toBe(soon.productionId)
  })

  it('shows a production-scoped reader only that production', async () => {
    const scoped = person([], { grants: [{ ability: 'box-office.report.view', via: 'role', record: { type: 'core.production', id: other.productionId } }] })
    const seen = await req('GET', '/api/box-office/reports/sales', undefined, scoped)
    expect(seen.status, JSON.stringify(seen.body)).toBe(200)
    expect(seen.body.productions.map((p: { id: string }) => p.id)).toEqual([other.productionId])
    expect((await req('GET', `/api/box-office/reports/sales?productionId=${h.productionId}`, undefined, scoped)).status).toBe(403)
  })

  it('downloads as CSV for someone who may export', async () => {
    expect((await req('GET', `/api/box-office/reports/sales.csv?productionId=${h.productionId}`, undefined, reader())).status).toBe(403)
    const response = await call(handle, 'GET', `/api/box-office/reports/sales.csv?productionId=${h.productionId}`, { actor: person(['box-office.report.export']) })
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text.split('\r\n')[0]).toBe('Performance,Starts,Ticket type,Channel,State,Tickets,Face value,Currency')
    expect(text).toContain(',Full price,online,sold,3,36.00,GBP')
    expect(text).toContain(',Full price,online,reserved,1,12.00,GBP')
  })
})
