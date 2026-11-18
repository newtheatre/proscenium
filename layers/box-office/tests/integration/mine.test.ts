// My tickets (C3): a signed-in person's own bookings, through the account scope, upcoming soonest
// first with each paid ticket's code (which the door admits), past ones after, and nobody else's.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import mineGet from '../../server/api/box-office/orders/mine.get'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const own = server({ 'GET /api/box-office/orders/mine': mineGet })
const mine = async (actor: ReturnType<typeof person>) => {
  const response = await call(own, 'GET', '/api/box-office/orders/mine', { actor })
  return { status: response.status, body: await response.json() as any }
}
let guests = 0

/** A free performance at `startsAt`, and one confirmed order of `quantity` tickets for it. */
async function booked(startsAt: number, quantity: number): Promise<{ h: House, orderId: string, accountId: string, codes: string[] }> {
  const h = await house(4, { startsAt })
  expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 0 }] })).status).toBe(200)
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/checkout`, { expectedTotalMinor: 0, email: `mine${++guests}@example.org` }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('confirmed')
  const [order] = await rows<{ account_id: string }>('SELECT account_id FROM box_office_orders WHERE id = ?', made.basket.orderId)
  return { h, orderId: made.basket.orderId, accountId: order!.account_id, codes: done.body.doorCodes }
}

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

describe('My tickets', () => {
  it('lists the person\'s bookings, upcoming soonest first with codes the door admits, and past ones after', async () => {
    const later = await booked(Date.UTC(2027, 4, 2, 19, 30), 2)
    const sooner = await booked(Date.UTC(2027, 1, 2, 19, 30), 1)
    const fan = person([])
    // Both bookings are the fan's: one made under their account, one under an account merged into it.
    await rows('UPDATE box_office_orders SET account_id = ? WHERE id = ?', fan.accountId!, later.orderId)
    await rows('UPDATE core_accounts SET merged_into_id = ? WHERE id = ?', fan.accountId!, sooner.accountId)

    const answer = await mine(fan)
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    expect(answer.body.past).toEqual([])
    expect(answer.body.upcoming.map((v: any) => v.orderId)).toEqual([sooner.orderId, later.orderId])
    const [first, second] = answer.body.upcoming
    expect(first).toMatchObject({ state: 'confirmed', amountDueMinor: 0, production: { title: expect.any(String) }, performance: { id: sooner.h.performanceId, venue: expect.stringContaining('Box office venue') } })
    expect(second.tickets).toHaveLength(2)
    expect(second.tickets[0]).toMatchObject({ label: 'Full price', admitted: false, doorCode: expect.stringMatching(/^tkt\./) })
    // The code shown is the ticket's own: the same code part as the email's, and the door admits it.
    expect(second.tickets.map((x: any) => x.doorCode.split('.')[2]).sort()).toEqual(later.codes.map(c => c.split('.')[2]).sort())
    const scanned = await req('POST', `/api/box-office/performances/${later.h.performanceId}/scan`, { code: second.tickets[0].doorCode }, person(['box-office.ticket.admit']))
    expect(scanned.body).toMatchObject({ result: 'admitted' })

    // Once the performance is over, the visit moves to the past.
    setClock(Date.UTC(2027, 1, 3))
    try {
      const after = await mine(fan)
      expect(after.body.upcoming.map((v: any) => v.orderId)).toEqual([later.orderId])
      expect(after.body.past.map((v: any) => v.orderId)).toEqual([sooner.orderId])
    }
    finally {
      setClock(NOV_16)
    }
  })

  it('shows nobody else\'s bookings, and needs a sign-in', async () => {
    await booked(Date.UTC(2027, 5, 2, 19, 30), 1)
    expect((await mine(person([]))).body).toEqual({ upcoming: [], past: [] })
    const signedOut = await call(own, 'GET', '/api/box-office/orders/mine')
    expect(signedOut.status).toBe(401)
  })
})
