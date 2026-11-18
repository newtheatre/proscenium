// The desk (R-3, R-4, R-5, BO-30; Box office specification, part 3, "Reserve now, pay at the
// desk"): a reservation is found by its reference or desk code; changed to who actually came, with
// the seats and the amount due moved together; paid through the till, where success confirms it,
// issues the tickets, admits them and posts the sale in one batch and failure leaves the
// reservation intact; and tickets are sold to somebody at the desk with nobody's details taken.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, nowMs, setClock } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { resetRateLimits } from '#kit/ratelimit'
import { attest, cancelIntent, openSession } from '../../../payments/server/services'
import releaseReservations from '../../server/tasks/release-reservations'
import { createPromoCode } from '../../server/promo-codes'
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
async function reserved(h: House, quantity: number, name = 'Desk Guest') {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `desk${++guests}@example.org`, name }, null, { 'x-basket-token': made.basket.token })
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
    await changeSetting(unit.view(), 'payments.cash.enabled', true, { reason: 'test', confirm: true }) // these take cash
    await changeSetting(unit.view(), 'box-office.checkout.payment-timing', 'buyer-chooses', { reason: 'test', confirm: true })
  })
  cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
  for (const who of [seller, onlooker]) await commit(unit => openSession(unit.view(), { accountId: who.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('a till session opened by a sale', () => {
  const spaceOf = async (h: House) => (await rows<{ space_id: string }>('SELECT space_id FROM core_performances WHERE id = ?', h.performanceId))[0]!.space_id
  const fresh = () => person(['payments.session.open', 'box-office.order.view', 'box-office.order.sell'])
  const opening = (h: House, actor: ReturnType<typeof person>, spaceId?: string) => req('POST', '/api/payments/till/session', { spaceId, panels: [{ basket: 'box-office', input: { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }] } }] }, actor)

  it('opens at the space of tonight\'s performance when the device has no place', async () => {
    const tonight = await house(4, { startsAt: nowMs() + 60_000 })
    const opened = await opening(tonight, fresh())
    expect(opened.body, JSON.stringify(opened.body)).toMatchObject({ opened: true, session: { spaceId: await spaceOf(tonight) } })
  })

  it('keeps the device\'s own place, and says nothing for a performance on another day', async () => {
    const tonight = await house(4, { startsAt: nowMs() + 60_000 })
    const later = await house(4)
    expect((await opening(tonight, fresh(), await spaceOf(later))).body.session.spaceId).toBe(await spaceOf(later))
    expect((await opening(later, fresh())).body.session.spaceId).not.toBe(await spaceOf(later))
  })
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
    // Your session lists the sale by the booking's reference, linked to the order.
    const mine = await req('GET', '/api/payments/session', undefined, seller)
    expect(mine.body.sales.find((x: { intentId: string }) => x.intentId === again.body.intentId)).toMatchObject({ state: 'succeeded', owners: [{ module: 'box-office', reference: r.reference, to: `/console/box-office/orders/${r.orderId}` }] })
  })

  it('is found by the buyer\'s name, with who booked and for what, soonest first', async () => {
    const h = await house(4)
    const first = await reserved(h, 1, 'Ottoline Quibble')
    const second = await reserved(h, 1, 'Ottoline Quibble')
    const found = await req('GET', '/api/box-office/desk/orders?q=quibble', undefined, seller)
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.orders.map((o: { orderId: string }) => o.orderId)).toEqual([first.orderId, second.orderId])
    expect(found.body.orders[0]).toMatchObject({ buyer: 'Ottoline Quibble', performance: { title: expect.any(String), startsAt: expect.any(Number) } })
    // A reference still finds just its own booking.
    expect((await req('GET', `/api/box-office/desk/orders?q=${second.reference}`, undefined, seller)).body.orders).toHaveLength(1)
  })

  it('shows a payment left unfinished, such as by a reload, and cancelling it from the desk puts the reservation back', async () => {
    const h = await house(4)
    const r = await reserved(h, 2)
    const left = await till({ orderId: r.orderId, expectedTotalMinor: r.totalMinor })
    expect(left.status, JSON.stringify(left.body)).toBe(200)
    // The page is reloaded: the till picks the sale up from the session, and the desk sees the booking waiting on it.
    expect((await req('GET', '/api/payments/session', undefined, seller)).body.unfinished).toEqual({ intentId: left.body.intentId, amountMinor: r.totalMinor })
    const found = await req('GET', `/api/box-office/desk/orders?q=${r.reference}`, undefined, seller)
    expect(found.body.orders[0]).toMatchObject({ state: 'awaiting_payment', intentId: left.body.intentId })
    const cancelled = await req('POST', `/api/payments/intents/${left.body.intentId}/cancel`, {}, seller)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect((await req('GET', `/api/box-office/desk/orders?q=${r.reference}`, undefined, seller)).body.orders[0]).toMatchObject({ state: 'reserved', intentId: null, amountDueMinor: r.totalMinor })
    expect((await req('GET', '/api/payments/session', undefined, seller)).body.unfinished).toBeNull()
    expect(await claimed(h)).toBe(2)
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

  it('is split so one of a group pays for their own tickets, and the rest stay reserved', async () => {
    const h = await house(5)
    const r = await reserved(h, 3)
    const lines = (await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", r.orderId)).map(l => l.id)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/split`, { lineIds: [lines[0]] }, onlooker)).status).toBe(403)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/split`, { lineIds: lines }, seller)).body.code).toBe('box-office.desk.split-all')

    const split = await req('POST', `/api/box-office/orders/${r.orderId}/split`, { lineIds: [lines[0], lines[1]] }, seller)
    expect(split.status, JSON.stringify(split.body)).toBe(200)
    expect(split.body).toMatchObject({ totalMinor: 2400, remainingMinor: 1200 })
    expect(split.body.reference).not.toBe(r.reference)
    const original = await order(r.orderId)
    expect(original).toMatchObject({ state: 'reserved', total_minor: 1200 })
    expect(await order(split.body.orderId)).toMatchObject({ state: 'reserved', total_minor: 2400, split_from_id: r.orderId, account_id: original.account_id })
    // The seats moved with their claims: none was let go or taken again.
    expect(await claimed(h)).toBe(3)
    expect(await count("SELECT count(*) AS n FROM box_office_claims c JOIN box_office_holds k ON k.id = c.hold_id WHERE k.order_id = ? AND c.state = 'confirmed'", split.body.orderId)).toBe(2)
    expect((await req('POST', `/api/box-office/orders/${r.orderId}/split`, { lineIds: [lines[0]] }, seller)).body.code).toBe('box-office.order.lines-changed')

    // The part split off is paid at the till; the rest is still reserved, under the same reference.
    const sale = await till({ orderId: split.body.orderId, expectedTotalMinor: 2400 })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    expect(await tickets(split.body.orderId)).toHaveLength(2)
    expect(await tickets(r.orderId)).toEqual([])
    expect(await order(r.orderId)).toMatchObject({ state: 'reserved', total_minor: 1200 })
    expect(await deferred(h)).toBe(-2400)
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
    // Each line records the price row it was sold at.
    const price = (await rows<{ id: string }>('SELECT id FROM box_office_prices WHERE band_id = ? AND ticket_type_id = ?', h.bandId, h.fullId))[0]!.id
    expect(await rows('SELECT price_id FROM box_office_order_lines WHERE order_id = ?', made!.id)).toEqual([{ price_id: price }, { price_id: price }])
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

  it('puts the tickets on the till\'s receipt: one email, and the order joins the buyer', async () => {
    const h = await house(3)
    const sale = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input: { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }] } }], receipt: { email: 'receipt.buyer@example.org' } }, seller)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    const [made] = await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    expect(made!.account_id).toBeNull()
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    const after = await order(made!.id)
    expect(after).toMatchObject({ state: 'confirmed' })
    expect(after!.account_id).toBeTruthy()
    // One email: the receipt, with the tickets' link on it, and no separate tickets message.
    const sent = await rows<{ type_key: string, address: string }>('SELECT type_key, address FROM core_notifications WHERE subject_id = ? OR address = ?', sale.body.intentId, 'receipt.buyer@example.org')
    expect(sent).toEqual([{ type_key: 'payments.till-receipt-link', address: 'receipt.buyer@example.org' }])
    expect(await count('SELECT count(*) AS n FROM core_notifications WHERE subject_id = ?', made!.id)).toBe(0)
  })

  it('splits the booking with the sale: each person\'s receipt links only their own tickets', async () => {
    const h = await house(4)
    const input = { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 3 }] }
    const splits = [{ items: [{ basket: 'box-office', line: 0, quantity: 1 }, { basket: 'box-office', line: 2, quantity: 1 }] }, { items: [{ basket: 'box-office', line: 1, quantity: 1 }] }]
    const sale = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }], splits }, seller)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(sale.body.amountMinor).toBe(3600)
    const made = await rows<Record<string, any>>('SELECT id, total_minor, account_id FROM box_office_orders WHERE intent_id = ? ORDER BY total_minor DESC', sale.body.intentId)
    expect(made.map(o => o.total_minor)).toEqual([2400, 1200])
    expect(await claimed(h)).toBe(3)

    const pay = (split: number, email: string) => inContext(() => attest({ intentId: sale.body.intentId, providerAccountId: cash, method: 'cash', split, receipt: { email } }), seller)
    expect(await pay(1, 'split.one@example.org')).toMatchObject({ settled: false })
    expect(await pay(2, 'split.two@example.org')).toMatchObject({ settled: true })

    const owners = await rows<{ total_minor: number, state: string, address: string }>('SELECT o.total_minor, o.state, e.address FROM box_office_orders o JOIN core_account_emails e ON e.account_id = o.account_id WHERE o.intent_id = ? ORDER BY o.total_minor DESC', sale.body.intentId)
    expect(owners).toEqual([
      { total_minor: 2400, state: 'confirmed', address: 'split.one@example.org' },
      { total_minor: 1200, state: 'confirmed', address: 'split.two@example.org' },
    ])
    expect(await tickets(made[0]!.id)).toHaveLength(2)
    expect(await tickets(made[1]!.id)).toHaveLength(1)
    // One email each, each with a link of its own.
    const sent = await rows<{ address: string, payload: string }>("SELECT address, payload FROM core_notifications WHERE type_key = 'payments.till-receipt-link' AND address IN ('split.one@example.org', 'split.two@example.org') ORDER BY address")
    expect(sent.map(s => s.address)).toEqual(['split.one@example.org', 'split.two@example.org'])
    expect(sent[0]!.payload).not.toEqual(sent[1]!.payload)
  })

  it('keeps one booking when a promo code is on the sale, since splitting it could change the price', async () => {
    const h = await house(4)
    await commit(unit => createPromoCode(unit.view(), { code: 'SPLITTEN', effect: 'percent_off', value: 1000 }, null))
    const input = { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }], promoCode: 'SPLITTEN' }
    const splits = [{ items: [{ basket: 'box-office', line: 0, quantity: 1 }] }, { items: [{ basket: 'box-office', line: 1, quantity: 1 }] }]
    const sale = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }], splits }, seller)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(await count('SELECT count(*) AS n FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)).toBe(1)
  })

  it('emails the tickets to an address the buyer gives, and the order joins that account', async () => {
    const h = await house(3)
    const sale = await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }], email: 'Desk.Buyer@Example.org' })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    const [made] = await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    expect(made!.account_id).toBeTruthy()
    const [owner] = await rows<{ address: string }>('SELECT address FROM core_account_emails WHERE account_id = ?', made!.account_id)
    expect(owner!.address).toBe('desk.buyer@example.org')
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    expect(await count('SELECT count(*) AS n FROM core_notifications WHERE subject_id = ? AND type_key LIKE \'box-office.order-confirmed%\'', made!.id)).toBe(1)
  })

  it('finds a buyer by name in the till\'s box and sends the tickets to them', async () => {
    const h = await house(3)
    const { accountId } = await commit(unit => findOrCreateAccount(unit.view(), { address: 'picked.buyer@example.org', name: 'Pickering Buyer', origin: 'guest' }))
    const found = await req('GET', '/api/box-office/desk/buyers?q=Pickering', undefined, seller)
    expect(found.status, JSON.stringify(found.body)).toBe(200)
    expect(found.body.people).toEqual([expect.objectContaining({ id: accountId, label: 'Pickering Buyer', claimed: false })])
    expect(JSON.stringify(found.body)).not.toContain('picked.buyer@example.org')
    expect((await req('GET', '/api/box-office/desk/buyers?q=Pickering', undefined, onlooker)).status).toBe(403)
    const input = { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }], accountId }
    const sale = await till(input)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    const [made] = await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    expect(made!.account_id).toBe(accountId)
    expect((await till({ ...input, email: 'both@example.org' })).status).toBe(422)
    expect((await till({ ...input, accountId: 'acc_nobody' })).body.code).toBe('box-office.desk.no-address')
  })

  it('marks a companion ticket, which is named for the access scheme member it goes with', async () => {
    // Tomorrow, so it is in the desk's list.
    const h = await house(3, { startsAt: nowMs() + 86_400_000 })
    await inContext(async () => (await import('../../server/ticket-types')).ensureManagedTicketTypes())
    const [companion] = await rows<{ id: string }>("SELECT id FROM box_office_ticket_types WHERE managed_by = 'box-office.companion'")
    expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: companion!.id, amountMinor: 0 }] })).status).toBe(200)
    const desk = await req('GET', '/api/box-office/desk/performances', undefined, seller)
    const rowsOf = desk.body.performances.find((p: { performanceId: string }) => p.performanceId === h.performanceId).rows as { ticketTypeId: string, holder?: true, companion?: true }[]
    expect(rowsOf.find(r => r.ticketTypeId === companion!.id)).toMatchObject({ holder: true, companion: true })
    expect(rowsOf.find(r => r.ticketTypeId === h.fullId)).not.toHaveProperty('companion')
  })

  it('takes a promo code the buyer gives, on the dearest tickets first, and gives its uses back when the payment is cancelled', async () => {
    const h = await house(5)
    const code = 'DESK' + h.performanceId.slice(-6).toUpperCase()
    await commit(unit => createPromoCode(unit.view(), { code, effect: 'percent_off', value: 5000, maxPerOrder: 1 }, null))
    const input = { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }, { bandId: h.bandId, ticketTypeId: h.concessionId, quantity: 1 }], promoCode: code.toLowerCase() }
    const summary = await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input }] }, seller)
    expect(summary.body, JSON.stringify(summary.body)).toMatchObject({ amountMinor: 600 + 800, panels: [{ lines: [{ label: `Full price (${code})`, amountMinor: 600 }, { label: 'Concession', amountMinor: 800 }] }] })
    const sale = await till(input)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(sale.body.amountMinor).toBe(1400)
    const [made] = await rows<{ id: string }>('SELECT id FROM box_office_orders WHERE intent_id = ?', sale.body.intentId)
    expect(await rows('SELECT list_minor, discount_minor, amount_minor, promo_redemption_id IS NOT NULL AS redeemed FROM box_office_order_lines WHERE order_id = ? ORDER BY list_minor DESC', made!.id))
      .toEqual([{ list_minor: 1200, discount_minor: 600, amount_minor: 600, redeemed: 1 }, { list_minor: 800, discount_minor: 0, amount_minor: 800, redeemed: 0 }])
    expect(await count('SELECT used AS n FROM box_office_promo_codes WHERE code = ?', code)).toBe(1)
    await commit(unit => cancelIntent(unit.view(), sale.body.intentId))
    expect(await count('SELECT used AS n FROM box_office_promo_codes WHERE code = ?', code)).toBe(0)
    expect((await till({ ...input, promoCode: 'NOSUCHCODE' })).body.code).toBe('box-office.promo.unknown')
  })

  it('shows what was sold after the payment, and emails the tickets afterwards', async () => {
    const h = await house(4)
    const sale = await till({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 2 }] })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect((await req('GET', `/api/box-office/desk/sold?intent=${sale.body.intentId}`, undefined, seller)).body.orders).toEqual([])
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    const sold = await req('GET', `/api/box-office/desk/sold?intent=${sale.body.intentId}`, undefined, seller)
    expect(sold.status, JSON.stringify(sold.body)).toBe(200)
    expect(sold.body.orders).toEqual([expect.objectContaining({ reference: expect.any(String), buyer: null, performance: expect.objectContaining({ id: h.performanceId }) })])
    const o = sold.body.orders[0]
    expect(o.lines).toEqual([expect.objectContaining({ ticketType: 'Full price', amountMinor: 1200, admitted: false }), expect.objectContaining({ admitted: false })])
    const before = await rows<{ code_hash: string }>('SELECT k.code_hash FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id WHERE l.order_id = ? ORDER BY k.id', o.orderId)

    // Printed at the till: each ticket with its show, type, number and the code the door scans.
    const printed = await req('GET', `/api/box-office/desk/orders/${o.orderId}/tickets`, undefined, seller)
    expect(printed.status, JSON.stringify(printed.body)).toBe(200)
    expect(printed.body.reference).toBe(o.reference)
    expect(printed.body.tickets).toEqual([1, 2].map(n => expect.objectContaining({ number: `${o.reference}-${n}`, ticketType: 'Full price', holder: null, admitted: false, doorCode: expect.stringMatching(/^tkt\./), startsAt: o.performance.startsAt })))
    expect((await req('GET', `/api/box-office/desk/orders/${o.orderId}/tickets`, undefined, onlooker)).status).toBe(403)

    expect((await req('POST', `/api/box-office/desk/orders/${o.orderId}/send`, { email: 'after@example.org' }, onlooker, { 'idempotency-key': `send-${o.orderId}-x` })).status).toBe(403)
    const sent = await req('POST', `/api/box-office/desk/orders/${o.orderId}/send`, { email: 'After.Sale@Example.org' }, seller, { 'idempotency-key': `send-${o.orderId}` })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    expect((await order(o.orderId)).account_id).toBeTruthy()
    expect(await count("SELECT count(*) AS n FROM core_notifications WHERE subject_id = ? AND type_key LIKE 'box-office.order-confirmed%'", o.orderId)).toBe(1)
    // The tickets keep their codes: the message links to the booking, which shows them.
    const after = await rows<{ code_hash: string }>("SELECT k.code_hash FROM box_office_tickets k JOIN box_office_order_lines l ON l.id = k.order_line_id WHERE l.order_id = ? AND k.state = 'valid' ORDER BY k.id", o.orderId)
    expect(after).toEqual(before)
    // Sent once: a second send is refused rather than sending different codes again.
    expect((await req('POST', `/api/box-office/desk/orders/${o.orderId}/send`, { email: 'other@example.org' }, seller, { 'idempotency-key': `send-${o.orderId}-2` })).body.code).toBe('box-office.desk.already-sent')
  })

  it('keeps a code set "not with member or concession prices" off the concession at the till', async () => {
    const h = await house(5)
    const code = 'NOREQ' + h.performanceId.slice(-6).toUpperCase()
    await commit(unit => createPromoCode(unit.view(), { code, effect: 'percent_off', value: 2000, notWithRequirements: true }, null))
    const input = { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity: 1 }, { bandId: h.bandId, ticketTypeId: h.concessionId, quantity: 1 }], promoCode: code }
    const summary = await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input }] }, seller)
    expect(summary.body, JSON.stringify(summary.body)).toMatchObject({ amountMinor: 960 + 800, panels: [{ lines: [{ label: `Full price (${code})`, amountMinor: 960 }, { label: 'Concession', amountMinor: 800 }] }] })
    const sale = await till(input)
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(sale.body.amountMinor).toBe(1760)
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
