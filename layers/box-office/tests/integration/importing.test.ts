// Bringing in bookings from another system (server/importing.ts): an unpaid booking becomes a
// reservation with its seats taken, its reference kept and its old code finding it at the door and
// the till; a free one is confirmed with tickets; nothing is sent; a second import changes nothing;
// one cancelled since is released; and one that cannot be placed is refused alone.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, deliver, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import importPost from '../../server/api/box-office/import/bookings.post'
import importGet from '../../server/api/box-office/import/[id].get'
import { openSession } from '../../../payments/server/services'
import attestPost from '../../../payments/server/api/payments/intents/[id]/attest.post'
import { scan } from '../../server/door'
import { findOrders } from '../../server/desk'
import { house, NOV_16, ready, req, type House } from './stage'

const handle = server({ 'POST /api/box-office/import/bookings': importPost, 'GET /api/box-office/import/:id': importGet, 'POST /api/payments/intents/:id/attest': attestPost })
const importer = person(['box-office.order.import'])
const steward = person(['box-office.ticket.admit', 'box-office.order.sell', 'box-office.order.view'])
// As long as a real one: an address, a 32-character id and a 43-character signature.
const OLD_QR = (id: string) => `https://old-theatre.example/qr/${id.padEnd(32, '0')}.s1Gnature-_x${'aB3'.repeat(10)}Q`

let keys = 0
async function post(body: unknown, actor: ReturnType<typeof person> | null = importer) {
  const response = await call(handle, 'POST', '/api/box-office/import/bookings', { actor: actor ?? undefined, body, headers: { 'idempotency-key': `imp${++keys}` } })
  return { status: response.status, body: await response.json() as any }
}
const one = async <T = Record<string, any>>(sql: string, ...params: unknown[]) => (await rows<T>(sql, ...params))[0]!

let h: House
let slug: string
let startsAt: number
const booking = (reference: string, extra: Record<string, unknown> = {}) => ({
  reference, code: OLD_QR(reference.toLowerCase()), email: `${reference.toLowerCase()}@example.org`, name: 'Old Buyer', production: slug, startsAt,
  tickets: [{ type: 'Full price', amountMinor: 1000 }, { type: 'Concession', amountMinor: 800 }], ...extra,
})

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  h = await house(6)
  slug = (await one<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', h.productionId)).slug
  startsAt = (await one<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', h.performanceId)).starts_at
})

describe('importing bookings from another system', () => {
  it('is only for someone who may', async () => {
    expect((await post({ bookings: [booking('AAAA11')] }, person(['box-office.order.sell']))).status).toBe(403)
  })

  it('says what a file would do without writing anything', async () => {
    const dry = await post({ dryRun: true, bookings: [booking('AAAA11'), booking('BBBB22', { production: 'no-such-show' }), booking('CCCC33', { cancelled: true })] })
    expect(dry.status, JSON.stringify(dry.body)).toBe(200)
    expect(dry.body).toMatchObject({ queued: 0, import: 1, leftOut: 1 })
    expect(dry.body.refused).toHaveLength(1)
    expect(dry.body.refused[0].reference).toBe('BBBB22')
    expect((await one<{ n: number }>('SELECT count(*) AS n FROM box_office_orders')).n).toBe(0)
  })

  it('makes a reservation that keeps its reference, takes its seats, and tells nobody', async () => {
    const mailBefore = (await one<{ n: number }>('SELECT count(*) AS n FROM core_notifications')).n
    const made = await post({ bookings: [booking('AAAA11', { createdAt: NOV_16 - 86_400_000 }), booking('FREE01', { tickets: [{ type: 'Full price', amountMinor: 0 }] })] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.queued).toBe(2)
    expect((await deliver()).every(outcome => outcome === 'done')).toBe(true)

    const order = await one('SELECT * FROM box_office_orders WHERE reference = ?', 'AAAA11')
    expect(order).toMatchObject({ state: 'reserved', channel: 'online', total_minor: 1800, created_at: NOV_16 - 86_400_000 })
    expect(order.account_id).toBeTruthy()
    const pool = await one('SELECT capacity, claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId)
    expect(pool.claimed).toBe(3)
    expect((await one<{ n: number }>("SELECT count(*) AS n FROM box_office_claims WHERE state = 'confirmed'")).n).toBe(3)
    expect((await one<{ n: number }>('SELECT count(*) AS n FROM core_notifications')).n).toBe(mailBefore)

    // The free booking is confirmed, with its ticket issued.
    const free = await one('SELECT * FROM box_office_orders WHERE reference = ?', 'FREE01')
    expect(free.state).toBe('confirmed')
    expect((await one<{ n: number }>("SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.state = 'valid'", free.id)).n).toBe(1)

    const summary = await call(handle, 'GET', `/api/box-office/import/${made.body.importId}`, { actor: importer })
    expect(await summary.json()).toMatchObject({ orders: 2, performances: [{ performanceId: h.performanceId, orders: 2, tickets: 3 }] })
  })

  it('is found at the door and the till by the code the buyer already holds, and by its reference', async () => {
    const atDoor = await inContext(() => scan({ performanceId: h.performanceId, code: OLD_QR('aaaa11') }), steward)
    expect(atDoor.result).toBe('not_paid')
    expect(atDoor.reservation).toMatchObject({ reference: 'AAAA11', tickets: 2, amountDueMinor: 1800 })
    const atTill = await req('GET', `/api/box-office/desk/orders?q=${encodeURIComponent(OLD_QR('aaaa11'))}`, undefined, steward)
    expect(atTill.body.orders.map((o: { reference: string }) => o.reference)).toEqual(['AAAA11'])
    expect((await inContext(() => findOrders('aaaa11'), steward)).map(o => o.reference)).toEqual(['AAAA11'])
    // The free booking's code sends the steward to the list, where its ticket is admitted.
    expect((await inContext(() => scan({ performanceId: h.performanceId, code: OLD_QR('free01') }), steward)).result).toBe('reference')
  })

  it('changes nothing when the same file is imported again, and releases what was cancelled since', async () => {
    const again = await post({ dryRun: true, bookings: [booking('AAAA11'), booking('FREE01')] })
    expect(again.body).toMatchObject({ import: 0, already: 2 })
    expect((await post({ bookings: [booking('AAAA11')] })).status).toBe(422)

    const cancelled = await post({ bookings: [booking('AAAA11', { cancelled: true }), booking('DDDD44')] })
    expect(cancelled.body).toMatchObject({ queued: 2, import: 1, release: 1 })
    await deliver()
    expect((await one('SELECT state FROM box_office_orders WHERE reference = ?', 'AAAA11')).state).toBe('expired')
    expect((await one('SELECT state FROM box_office_orders WHERE reference = ?', 'DDDD44')).state).toBe('reserved')
    // FREE01's one seat and DDDD44's two.
    expect((await one('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId)).claimed).toBe(3)
  })

  it('refuses a booking the house has no room for, and still brings in the rest', async () => {
    const big = booking('FULL99', { tickets: Array.from({ length: 4 }, () => ({ type: 'Full price', amountMinor: 1000 })) })
    const made = await post({ bookings: [big, booking('EEEE55', { tickets: [{ type: 'Concession', amountMinor: 800 }] })] })
    expect(made.body.queued).toBe(2)
    await deliver()
    expect(await rows('SELECT id FROM box_office_orders WHERE reference = ?', 'FULL99')).toHaveLength(0)
    expect((await one('SELECT state FROM box_office_orders WHERE reference = ?', 'EEEE55')).state).toBe('reserved')
    expect((await one('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId)).claimed).toBe(4)
  })

  it('names a ticket of a type with requirements for the buyer, with nothing to check again', async () => {
    await rows("UPDATE box_office_ticket_types SET requirement_refs = '[\"membership.member\"]' WHERE name = 'Concession'")
    const made = await post({ bookings: [booking('MEMB01', { tickets: [{ type: 'Concession', amountMinor: 600 }] })] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await deliver()
    const line = await one('SELECT l.requirement_ref, l.requirement_account_id, o.account_id FROM box_office_order_lines l JOIN box_office_orders o ON o.id = l.order_id WHERE o.reference = ?', 'MEMB01')
    expect(line.requirement_ref).toBeNull()
    expect(line.requirement_account_id).toBe(line.account_id)

    // It is paid for at the till like any reservation: the seller is not asked to check it again.
    const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment'])
    const cash = (await one<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'")).id
    await inContext(async () => {
      const unit = createUnit()
      await openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 })
      await unit.commit()
    })
    const order = await one<{ id: string }>('SELECT id FROM box_office_orders WHERE reference = ?', 'MEMB01')
    const sale = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input: { orderId: order.id, expectedTotalMinor: 600, admit: false } }] }, seller)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    // Through the route, as a seller does it: on a site nobody has yet booked on, the request's own address serves for the message.
    const paid = await call(handle, 'POST', `/api/payments/intents/${sale.body.intentId}/attest`, { actor: seller, body: { providerAccountId: cash, method: 'cash' }, headers: { 'idempotency-key': 'imp-pay-1' } })
    expect(await paid.json()).toMatchObject({ settled: true, unfulfilled: false })
    expect((await one('SELECT state FROM box_office_orders WHERE id = ?', order.id)).state).toBe('confirmed')
    expect((await one<{ n: number }>("SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.state = 'valid'", order.id)).n).toBe(1)
    await rows("UPDATE box_office_ticket_types SET requirement_refs = NULL WHERE name = 'Concession'")
  })
})
