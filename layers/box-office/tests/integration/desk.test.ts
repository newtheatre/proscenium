// The desk (R-3, R-4, R-5, BO-30; Box office specification, part 3, "Reserve now, pay at the
// desk"): a reservation is found by its reference or desk code; changed to who actually came, with
// the seats and the amount due moved together; paid through the till, where success confirms it,
// issues the tickets, admits them and posts the sale in one batch and failure leaves the
// reservation intact; and tickets are sold to somebody at the desk with nobody's details taken.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { attest, cancelIntent, openSession } from '../../../payments/server/services'
import releaseReservations from '../../server/tasks/release-reservations'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment'])
const onlooker = person(['payments.session.open', 'box-office.order.view'])
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const claimed = async (h: House) => (await rows<{ claimed: number }>('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!.claimed
const deferred = async (h: House) => (await rows<{ total: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.deferred-ticket-income' AND e.performance_id = ?", h.performanceId))[0]!.total
const tickets = (orderId: string) => rows<{ state: string, admitted_at: number | null, admitted_scan_id: string | null }>('SELECT t.state, t.admitted_at, t.admitted_scan_id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', orderId)
let cash: string
let guests = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

/** A reservation of `quantity` full-price tickets, as the buyer made it online. */
async function reserved(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `desk${++guests}@example.org`, name: 'Desk Guest' }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  return { orderId: made.basket.orderId, reference: done.body.reference as string, deskCode: done.body.deskCode as string, totalMinor: made.basket.totalMinor }
}

const till = (input: Record<string, unknown>, actor = seller) => req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }] }, actor)
const payCash = (intentId: string) => inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash' }), seller)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await commit(async (unit) => {
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'box-office.checkout.payment-timing', 'buyer-chooses', { reason: 'test', confirm: true })
  })
  cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
  for (const who of [seller, onlooker]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('a reservation at the desk', () => {
  it('is found by its reference or its desk code, and by nothing else', async () => {
    const h = await house(4)
    const r = await reserved(h, 2)
    for (const q of [r.reference, r.reference.toLowerCase(), ` ${r.deskCode} `]) {
      const found = await req('GET', `/api/box-office/desk/orders?q=${encodeURIComponent(q)}`, undefined, seller)
      expect(found.status, JSON.stringify(found.body)).toBe(200)
      expect(found.body.orders).toHaveLength(1)
      expect(found.body.orders[0]).toMatchObject({ orderId: r.orderId, state: 'reserved', totalMinor: 2400, amountDueMinor: 2400 })
      expect(found.body.orders[0].lines).toHaveLength(2)
    }
    expect((await req('GET', '/api/box-office/desk/orders?q=NOPE', undefined, seller)).body.orders).toEqual([])
    expect((await req('GET', `/api/box-office/desk/orders?q=${r.reference}`, undefined, person([]))).status).toBe(403)
  })

  it('is paid through the till: confirmed, tickets issued and admitted, and the sale posted, in one batch', async () => {
    const h = await house(4)
    const r = await reserved(h, 2)
    expect((await till({ orderId: r.orderId, expectedTotalMinor: 1200, admit: true })).body).toMatchObject({ code: 'box-office.order.total-changed' })
    expect((await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor, admit: true }, onlooker)).status).toBe(403)
    expect((await order(r.orderId)).state).toBe('reserved')

    const sale = await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor, admit: true })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(sale.body).toMatchObject({ amountMinor: 2400 })
    expect(await order(r.orderId)).toMatchObject({ state: 'awaiting_payment', intent_id: sale.body.intentId, sold_by: seller.accountId, admit_on_payment: 1 })
    // Nothing is paid, issued or posted before the money has an answer, and no task lets the seats go.
    expect(await tickets(r.orderId)).toEqual([])
    expect(await deferred(h)).toBe(0)
    await inContext(() => (releaseReservations as unknown as () => Promise<void>)(), { kind: 'job' })
    expect(await claimed(h)).toBe(2)

    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true, unfulfilled: false })
    expect(await order(r.orderId)).toMatchObject({ state: 'confirmed', total_minor: 2400 })
    const issued = await tickets(r.orderId)
    expect(issued).toHaveLength(2)
    for (const t of issued) expect(t).toMatchObject({ state: 'valid', admitted_at: NOV_16 })
    expect(await rows('SELECT result, scanned_by, device_label FROM box_office_scans WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(issued.map(t => t.admitted_scan_id))))
      .toEqual([{ result: 'admitted', scanned_by: seller.accountId, device_label: 'Desk' }, { result: 'admitted', scanned_by: seller.accountId, device_label: 'Desk' }])
    expect(await deferred(h)).toBe(-2400)
    expect(await claimed(h)).toBe(2)
    expect((await req('GET', `/api/box-office/desk/orders?q=${r.reference}`, undefined, seller)).body.orders[0]).toMatchObject({ state: 'confirmed', amountDueMinor: 0 })
  })

  it('is left intact when the payment is cancelled, and can be paid again without admitting', async () => {
    const h = await house(4)
    const r = await reserved(h, 1)
    const first = await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor, admit: true })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    await commit(unit => cancelIntent(unit.view(), first.body.intentId))
    expect(await order(r.orderId)).toMatchObject({ state: 'reserved', intent_id: null, admit_on_payment: 0 })
    expect(await claimed(h)).toBe(1)
    expect(await tickets(r.orderId)).toEqual([])

    const again = await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(await payCash(again.body.intentId)).toMatchObject({ settled: true })
    expect(await tickets(r.orderId)).toEqual([{ state: 'valid', admitted_at: null, admitted_scan_id: null }])
  })

  it('is changed to who actually came: tickets off, on and of another type, with the amount due and the seats together', async () => {
    const h = await house(5)
    const r = await reserved(h, 3)
    const lines = (await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", r.orderId)).map(l => l.id)
    const changed = await req('POST', `/api/box-office/orders/${r.orderId}/amend`, { remove: [lines[0]], retype: [{ lineId: lines[1], ticketTypeId: h.concessionId }], add: [{ bandId: h.bandId, ticketTypeId: h.concessionId, quantity: 2 }] }, seller)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    // One full price kept, one now a concession, two concessions added.
    expect(changed.body).toMatchObject({ totalMinor: 1200 + 800 + 1600, amountDueMinor: 3600 })
    expect(await order(r.orderId)).toMatchObject({ state: 'reserved', total_minor: 3600 })
    expect(await claimed(h)).toBe(4)
    expect(await count("SELECT count(*) AS n FROM box_office_order_lines WHERE order_id = ? AND state = 'live'", r.orderId)).toBe(4)
    expect(await rows('SELECT kind, line_ids, "by" FROM box_office_cancellations WHERE order_id = ?', r.orderId)).toEqual([{ kind: 'staff', line_ids: JSON.stringify([lines[0]]), by: seller.accountId }])

    // More than the house has left is refused whole: nothing is added and nothing removed.
    const tooMany = await req('POST', `/api/box-office/orders/${r.orderId}/amend`, { remove: [lines[2]], add: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 3 }] }, seller)
    expect(tooMany.body.code).toMatch(/^box-office\.capacity\./)
    expect(await order(r.orderId)).toMatchObject({ total_minor: 3600 })
    expect(await claimed(h)).toBe(4)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/amend`, { remove: [lines[0]] }, seller)).body).toMatchObject({ code: 'box-office.order.lines-changed' })
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/amend`, { remove: [lines[2]] }, onlooker)).status).toBe(403)

    // The till then takes what is due now.
    const sale = await till({ orderId: r.orderId, expectedTotalMinor: 3600 })
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    expect(await tickets(r.orderId)).toHaveLength(4)
    expect(await deferred(h)).toBe(-3600)
  })
})

describe('selling at the desk', () => {
  it('sells and admits in one press, with nobody\'s details taken', async () => {
    const h = await house(3)
    expect((await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }], admit: true }, onlooker)).status).toBe(403)
    const summary = await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input: { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }] } }] }, seller)
    expect(summary.body, JSON.stringify(summary.body)).toMatchObject({ amountMinor: 2400, panels: [{ lines: [{ label: 'Full price', amountMinor: 1200 }, { label: 'Full price', amountMinor: 1200 }] }] })

    const sale = await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }], admit: true })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    const [made] = await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    expect(made).toMatchObject({ channel: 'desk', state: 'awaiting_payment', account_id: null, total_minor: 2400, sold_by: seller.accountId })
    expect(await claimed(h)).toBe(2)
    // The seats are the desk's while it takes the money: one is left for anybody else.
    expect((await buy(h, 2)).ok).toBe(false)

    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    expect(await order(made!.id)).toMatchObject({ state: 'confirmed', account_id: null })
    const issued = await tickets(made!.id)
    expect(issued).toHaveLength(2)
    for (const t of issued) expect(t.admitted_at).toBe(NOV_16)
    expect(await deferred(h)).toBe(-2400)
    expect(await count('SELECT count(*) AS n FROM core_notifications WHERE subject_id = ?', made!.id)).toBe(0)
  })

  it('lets the seats go when the payment is cancelled, and never sells more than the house has', async () => {
    const h = await house(2)
    const sale = await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }] })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    const [made] = await rows<{ id: string }>('SELECT id FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    await commit(unit => cancelIntent(unit.view(), sale.body.intentId))
    expect((await order(made!.id)).state).toBe('expired')
    expect(await claimed(h)).toBe(0)

    const full = await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 3 }] })
    expect(full.body.code).toMatch(/^box-office\.capacity\./)
    expect(await claimed(h)).toBe(0)
    expect(await count("SELECT count(*) AS n FROM box_office_orders o JOIN box_office_order_lines l ON l.order_id = o.id WHERE l.performance_id = ? AND o.state = 'awaiting_payment'", h.performanceId)).toBe(0)
  })
})

describe('prices and pauses at the desk', () => {
  it('prices a change of type as of when the order was reserved, and an added ticket as of now', async () => {
    const h = await house(5)
    const r = await reserved(h, 2)
    const lines = (await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", r.orderId)).map(l => l.id)
    advanceClock(60_000)
    // The concession goes up after the booking was made.
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.concessionId, amountMinor: 1000 }] })).status).toBe(200)
    const changed = await req('POST', `/api/box-office/orders/${r.orderId}/amend`, { retype: [{ lineId: lines[0], ticketTypeId: h.concessionId }], add: [{ bandId: h.bandId, ticketTypeId: h.concessionId, quantity: 1 }] }, seller)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    // Full price kept, the swap at the old concession price, the new ticket at today's.
    expect(changed.body.totalMinor).toBe(1200 + 800 + 1000)
  })

  it('sells nothing new for a paused performance, but still takes payment for a reservation', async () => {
    const h = await house(4)
    const r = await reserved(h, 1)
    expect((await req('POST', `/api/box-office/performances/${h.performanceId}/sales/pause`, {})).status).toBe(200)
    expect((await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }] })).body).toMatchObject({ code: 'box-office.sales.paused' })
    const sale = await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
  })
})
