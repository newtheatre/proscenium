// Cancelling and refunding (BO-50, BO-51; Box office specification, part 3, "Cancelling and
// exchanging" and "A refund"): one batch cancels the lines, puts the seats back on sale, voids the
// tickets, lowers the total, writes the cancellation and asks for the refund, or changes nothing;
// refunding needs its own ability; the fee kept and the refund together empty what the tickets had
// deferred; a refund above the limit waits for a second person; and a seat let go is sold once.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, changeSetting, createUnit, newId, openSpecial, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { addAttempt } from '../../../payments/server/answers'
import { approveRefund, recordAnswer } from '../../../payments/server/services'
import { describeRefunds } from '../../../payments/server/refunds'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { deliver, env, inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import recogniseIncome from '../../server/tasks/recognise-income'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const boxOfficeManager = person(['box-office.order.cancel', 'box-office.order.refund'])
const assistant = person(['box-office.order.cancel'])
const steward = person(['box-office.ticket.admit'])
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const claimed = async (h: House) => (await rows<{ claimed: number }>('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!.claimed
const balance = async (key: string, performanceId: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ? AND e.performance_id = ?', key, performanceId))[0]!.total
const lineIds = async (orderId: string) => (await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", orderId)).map(r => r.id)
let card: string
let reason: string
let guests = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
const set = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key as any, value as any, { reason: 'test', confirm: true }))

/** An order paid online by card, with its door codes as the buyer was sent them. */
async function paid(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const b = made.basket
  const started = await req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: b.totalMinor, email: `refund${++guests}@example.org`, name: 'Paying Guest' }, null, { 'x-basket-token': b.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await commit(async unit => addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: b.totalMinor }).id)
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
  const [row] = await rows<{ sealed_variables: string, payload: string }>("SELECT sealed_variables, payload FROM core_notifications WHERE type_key IN ('box-office.order-confirmed', 'box-office.order-confirmed-guest') AND subject_id = ?", b.orderId)
  const codes = (JSON.parse((await inContext(() => openSpecial(row!.sealed_variables)))!).codes as string).split('\n\n')
  const told = JSON.parse(row!.payload) as { link?: string }
  const sealed = JSON.parse((await inContext(() => openSpecial(row!.sealed_variables)))!) as { link?: string }
  const link = (told.link ?? sealed.link)!
  return { orderId: b.orderId, lines: await lineIds(b.orderId), codes, token: link.slice(link.lastIndexOf('/') + 1) }
}

const cancel = (orderId: string, body: Record<string, unknown>, actor = boxOfficeManager) => req('POST', `/api/box-office/orders/${orderId}/cancel`, { reasonTermId: reason, ...body }, actor)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await set('box-office.reservations.confirm-email', false)
  await set('payments.refunds.self-approve-up-to', 5000)
  reason = (await inContext(() => listTerms('box-office.cancellation-reason'))).find(t => t.slug === 'cannot-attend')!.id
  world.refundAnswer = { state: 'succeeded', providerRef: 're_box_office' }
})

describe('cancelling tickets on a paid order', () => {
  it('cancels a line, frees its seat, voids its ticket and refunds it the way it was paid, in one batch', async () => {
    const h = await house(5)
    const o = await paid(h, 3)
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-3600)

    const done = await cancel(o.orderId, { lineIds: [o.lines[0]], refund: 'full', note: 'Rang to say they cannot come' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'confirmed', totalMinor: 2400, feeMinor: 0, refund: { state: 'approved', amountMinor: 1200 } })
    expect(await order(o.orderId)).toMatchObject({ state: 'confirmed', total_minor: 2400 })
    expect(await rows('SELECT state FROM box_office_order_lines WHERE id = ?', o.lines[0])).toEqual([{ state: 'cancelled' }])
    expect(await rows('SELECT c.state, c.release_reason FROM box_office_claims c JOIN box_office_order_lines l ON l.claim_id = c.id WHERE l.id = ?', o.lines[0])).toEqual([{ state: 'released', release_reason: 'cancelled' }])
    expect(await claimed(h)).toBe(2)
    expect(await rows('SELECT state, void_reason FROM box_office_tickets WHERE order_line_id = ?', o.lines[0])).toEqual([{ state: 'void', void_reason: 'cancelled' }])
    expect(await rows('SELECT kind, reason_term_id, note, line_ids, refund_id, fee_minor, "by" FROM box_office_cancellations WHERE order_id = ?', o.orderId))
      .toEqual([{ kind: 'staff', reason_term_id: reason, note: 'Rang to say they cannot come', line_ids: JSON.stringify([o.lines[0]]), refund_id: done.body.refund.id, fee_minor: 0, by: boxOfficeManager.accountId }])
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.cancelled' AND record_id = ?", o.orderId)).toBe(1)
    const [told] = await rows<{ payload: string }>("SELECT payload FROM core_notifications WHERE type_key = 'box-office.order-cancelled' AND subject_id = ?", o.orderId)
    expect(JSON.parse(told!.payload)).toMatchObject({ cancelled: '1 ticket', remaining: expect.stringContaining('12.00') })

    // The cancelled ticket's code is refused at the door, whichever of the three it was; the others still open it.
    const results = []
    for (const code of o.codes) results.push((await req('POST', `/api/box-office/performances/${h.performanceId}/scan`, { code }, steward)).body.result)
    expect(results.sort()).toEqual(['admitted', 'admitted', 'void'])

    // Nothing is taken off what is owed to the audience until the money has gone back.
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-3600)
    await deliver()
    expect(await rows('SELECT state, amount_minor FROM payments_refunds WHERE id = ?', done.body.refund.id)).toEqual([{ state: 'succeeded', amount_minor: 1200 }])
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-2400)

    // The same line cannot be cancelled again, and a used ticket cannot be cancelled at all.
    expect((await cancel(o.orderId, { lineIds: [o.lines[0]], refund: 'full' })).body).toMatchObject({ code: 'box-office.order.lines-changed' })
    expect((await cancel(o.orderId, { refund: 'full' })).body).toMatchObject({ code: 'box-office.order.already-admitted' })
    expect(await order(o.orderId)).toMatchObject({ state: 'confirmed', total_minor: 2400 })
    expect(await count('SELECT count(*) AS n FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.owner_record = ?', o.orderId)).toBe(1)
  })

  it('needs the refund ability to refund, and cancels the whole order with no refund without it', async () => {
    const h = await house(4)
    const o = await paid(h, 2)
    const refused = await cancel(o.orderId, { refund: 'full' }, assistant)
    expect(refused.status).toBe(403)
    expect(await order(o.orderId)).toMatchObject({ state: 'confirmed', total_minor: 2400 })
    expect((await cancel(o.orderId, { refund: 'none', reasonTermId: 'trm_nothing' }, assistant)).body).toMatchObject({ code: 'box-office.order.bad-reason' })
    expect((await req('POST', `/api/box-office/orders/${o.orderId}/cancel`, { refund: 'none' }, assistant)).body).toMatchObject({ code: 'box-office.order.bad-reason' })

    const done = await cancel(o.orderId, { refund: 'none' }, assistant)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'cancelled', totalMinor: 0, refund: null })
    expect(await order(o.orderId)).toMatchObject({ state: 'cancelled', total_minor: 0 })
    expect(await claimed(h)).toBe(0)
    expect(await count("SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.state = 'valid'", o.orderId)).toBe(0)
    expect(await count('SELECT count(*) AS n FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.owner_record = ?', o.orderId)).toBe(0)
    // The money stays where it was: nothing was given back.
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-2400)
  })

  it('keeps the fee for each ticket when refunding less the fee, and the two empty what the tickets had deferred', async () => {
    await set('box-office.cancellations.fee', 150)
    const h = await house(4)
    const o = await paid(h, 3)
    const done = await cancel(o.orderId, { lineIds: o.lines.slice(0, 2), refund: 'less-fee' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ totalMinor: 1200, feeMinor: 300, refund: { amountMinor: 2100, state: 'approved' } })
    expect(await balance('box-office.booking-fee-income', h.performanceId)).toBe(-300)
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-3300)
    await deliver()
    // What is left deferred is the one ticket still booked.
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-1200)
    // A full refund keeps nothing, whatever the fee is set to.
    const rest = await cancel(o.orderId, { refund: 'full' })
    expect(rest.body).toMatchObject({ state: 'cancelled', feeMinor: 0, refund: { amountMinor: 1200 } })
    await deliver()
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(0)
    expect(await balance('box-office.booking-fee-income', h.performanceId)).toBe(-300)
  })

  it('leaves a refund above the limit waiting for a second person, and never refunds more than was paid', async () => {
    await set('payments.refunds.self-approve-up-to', 1000)
    const h = await house(4)
    const o = await paid(h, 2)
    const done = await cancel(o.orderId, { lineIds: [o.lines[0]], refund: 'full' })
    expect(done.body).toMatchObject({ refund: { state: 'requested', amountMinor: 1200 } })
    // The seat is free and the ticket void at once; only the money waits.
    expect(await claimed(h)).toBe(1)
    await deliver()
    expect(await rows('SELECT state FROM payments_refunds WHERE id = ?', done.body.refund.id)).toEqual([{ state: 'requested' }])
    // Refunds names the order it is for, with its reference and a link to it.
    const [reference] = await rows<{ reference: string }>('SELECT reference FROM box_office_orders WHERE id = ?', o.orderId)
    const [summary] = await inContext(() => describeRefunds([done.body.refund.id]))
    expect(summary!.owner).toMatchObject({ module: 'box-office', record: o.orderId, reference: reference!.reference, to: `/console/box-office/orders/${o.orderId}` })
    await expect(commit(unit => approveRefund(unit.view(), done.body.refund.id, boxOfficeManager.accountId!))).rejects.toMatchObject({ code: 'payments.refund.own' })
    await commit(unit => approveRefund(unit.view(), done.body.refund.id, newId('acc')))
    await deliver()
    expect(await rows('SELECT state FROM payments_refunds WHERE id = ?', done.body.refund.id)).toEqual([{ state: 'succeeded' }])
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-1200)
    await set('payments.refunds.self-approve-up-to', 5000)
  })
})

describe('a seat let go', () => {
  it('is sold exactly once, however many buyers are waiting', async () => {
    const h = await house(1)
    const o = await paid(h, 1)
    expect((await buy(h, 1)).ok).toBe(false)
    expect((await cancel(o.orderId, { refund: 'full' })).status).toBe(200)
    const tries = await Promise.all(Array.from({ length: 12 }, () => buy(h, 1)))
    expect(tries.filter(t => t.ok)).toHaveLength(1)
    expect(await claimed(h)).toBe(1)
  })

  it('goes back on sale when staff cancel a reservation, with nothing to refund', async () => {
    await set('box-office.checkout.payment-timing', 'buyer-chooses')
    const h = await house(2)
    const made = await buy(h, 2)
    if (!made.ok) throw new Error(made.code)
    const reserved = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `reserve${++guests}@example.org`, name: 'Reserving Guest' }, null, { 'x-basket-token': made.basket.token })
    expect(reserved.body.state, JSON.stringify(reserved.body)).toBe('reserved')
    // A reservation needs no reason; paid tickets do.
    const done = await req('POST', `/api/box-office/orders/${made.basket.orderId}/cancel`, { refund: 'none' }, boxOfficeManager)
    expect(done.body).toMatchObject({ state: 'cancelled', refund: null, feeMinor: 0 })
    expect(await claimed(h)).toBe(0)
    expect(await count('SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', made.basket.orderId)).toBe(0)
  })
})

describe('a refund after the performance has taken place', () => {
  it('comes off ticket income once the income has been recognised, and leaves deferred income at nothing', async () => {
    const DAY = 86_400_000
    const h = await house(4, { startsAt: NOV_16 + DAY })
    const o = await paid(h, 2)
    advanceClock(2 * DAY)
    await env.DB.prepare("UPDATE core_performances SET state = 'completed', completed_at = ends_at WHERE id = ?").bind(h.performanceId).run()
    await inContext(() => (recogniseIncome as unknown as () => Promise<void>)(), { kind: 'job' })
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(0)
    expect(await balance('box-office.ticket-income', h.performanceId)).toBe(-2400)

    // Two days on, the manager has confirmed their sign-in again.
    const later = person(['box-office.order.cancel', 'box-office.order.refund'], { reassertedAt: NOV_16 + 2 * DAY } as any)
    expect((await cancel(o.orderId, { lineIds: [o.lines[0]], refund: 'full' }, later)).body).toMatchObject({ refund: { state: 'approved', amountMinor: 1200 } })
    await deliver()
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(0)
    expect(await balance('box-office.ticket-income', h.performanceId)).toBe(-1200)
  })
})

describe('a buyer cancelling paid tickets from their link', () => {
  const view = (token: string) => req('GET', '/api/box-office/orders/link', undefined, null, { 'x-order-token': token })
  const byBuyer = (token: string, body: Record<string, unknown> = {}) => req('POST', '/api/box-office/orders/link/cancel', body, null, { 'x-order-token': token })
  beforeAll(() => setClock(NOV_16))

  it('is refused while the theatre has not switched it on', async () => {
    const h = await house(4)
    const o = await paid(h, 2)
    expect((await view(o.token)).body).toMatchObject({ state: 'confirmed', buyerCancel: null })
    expect((await byBuyer(o.token)).body).toMatchObject({ code: 'box-office.order.cancel-at-desk' })
    expect(await claimed(h)).toBe(2)
  })

  it('refunds the price less the fee to the card, frees the seat and voids the ticket, with no second approver', async () => {
    await set('box-office.cancellations.by-buyer', true)
    await set('box-office.cancellations.fee', 150)
    // Above the self-approve limit: a buyer's refund is the system's, by the theatre's own terms.
    await set('payments.refunds.self-approve-up-to', 0)
    const h = await house(4)
    const o = await paid(h, 2)
    const seen = (await view(o.token)).body
    expect(seen.buyerCancel).toMatchObject({ feeMinor: 150 })
    expect(seen.buyerCancel.until).toBeLessThan(Date.UTC(2027, 2, 31))

    const done = await byBuyer(o.token, { lineIds: [o.lines[0]] })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'confirmed', totalMinor: 1200, amountDueMinor: 0, lines: [{ id: o.lines[1] }] })
    expect(await claimed(h)).toBe(1)
    expect(await rows('SELECT t.state, t.void_reason FROM box_office_tickets t WHERE t.order_line_id = ?', o.lines[0])).toEqual([{ state: 'void', void_reason: 'cancelled' }])
    expect(await rows('SELECT kind, fee_minor, by FROM box_office_cancellations WHERE order_id = ?', o.orderId)).toEqual([{ kind: 'customer', fee_minor: 150, by: null }])
    expect(await rows('SELECT r.amount_minor, r.state, r.requested_by FROM payments_refunds r JOIN box_office_cancellations c ON c.refund_id = r.id WHERE c.order_id = ?', o.orderId))
      .toEqual([{ amount_minor: 1050, state: 'approved', requested_by: null }])
    // The fee is the theatre's; the rest of the ticket stops being owed once the refund is made.
    await deliver()
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-1200)

    // The rest of the booking, all at once.
    expect((await byBuyer(o.token)).body).toMatchObject({ state: 'cancelled', lines: [], buyerCancel: null })
    expect(await order(o.orderId)).toMatchObject({ state: 'cancelled', total_minor: 0 })
    expect(await claimed(h)).toBe(0)
    await set('payments.refunds.self-approve-up-to', 5000)
    await set('box-office.cancellations.fee', 0)
  })

  it('stops at the cut-off before the performance', async () => {
    const HOUR = 3_600_000
    const h = await house(4, { startsAt: NOV_16 + 30 * HOUR })
    const o = await paid(h, 1)
    expect((await view(o.token)).body.buyerCancel).toMatchObject({ until: NOV_16 + 6 * HOUR })
    advanceClock(7 * HOUR)
    expect((await view(o.token)).body.buyerCancel).toBeNull()
    expect((await byBuyer(o.token)).body).toMatchObject({ code: 'box-office.order.cancel-at-desk' })
    expect(await claimed(h)).toBe(1)
  })

  it('leaves a used ticket alone', async () => {
    const h = await house(4)
    const o = await paid(h, 1)
    await env.DB.prepare('UPDATE box_office_tickets SET admitted_at = ? WHERE order_line_id = ?').bind(NOV_16, o.lines[0]).run()
    expect((await byBuyer(o.token)).body).toMatchObject({ code: 'box-office.order.already-admitted' })
  })
})
