// Keeping a payment being returned, for a booking (Box office specification, part 4, "Keeping a
// payment being returned"): the till gave up on a payment that went through after all. A booking
// that lapsed stays as it is and the money is ticket income for its performance; a reservation
// still waiting is confirmed with it; one paid another way since refuses, as the money is owed back.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { attest, cancelIntent, openSession, recordAnswer } from '../../../payments/server/services'
import { addAttempt } from '../../../payments/server/answers'
import { keepPayment } from '../../../payments/server/keep'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import releaseUnpaid from '../../server/api/box-office/performances/[id]/door/release-unpaid.post'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.order.release', 'box-office.ticket.admit'])
const manager = person(['payments.refund.approve'])
let cash: string
const handle = server({ 'POST /api/box-office/performances/:id/door/release-unpaid': releaseUnpaid })
let guests = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function reserved(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `kept${++guests}@example.org`, name: 'Door Guest' }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  return { orderId: made.basket.orderId as string, reference: done.body.reference as string, totalMinor: made.basket.totalMinor as number }
}

/** The till starts a payment for the reservation and gives up on it; the money turns out to have been taken. */
async function givenUp(r: { orderId: string, totalMinor: number }, release?: House) {
  const sale = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input: { orderId: r.orderId, expectedTotalMinor: r.totalMinor } }] }, seller)
  expect(sale.status, JSON.stringify(sale.body)).toBe(200)
  const intentId = sale.body.intentId as string
  const attemptId = await commit(async unit => addAttempt(unit.view(), { intentId, providerAccountId: cash, method: 'cash', amountMinor: r.totalMinor }).id)
  await commit(unit => cancelIntent(unit.view(), intentId))
  if (release) expect((await call(handle, 'POST', `/api/box-office/performances/${release.performanceId}/door/release-unpaid`, { actor: seller, body: {}, headers: { 'idempotency-key': `kp${guests}` } })).status).toBe(200)
  await inContext(() => recordAnswer(attemptId, { state: 'succeeded' }, { kind: 'person', reconciled: true }))
  const [refund] = await rows<{ id: string, state: string }>('SELECT r.id, r.state FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = ?', intentId)
  expect(refund).toMatchObject({ state: 'approved' })
  return { intentId, refundId: refund!.id }
}

const order = async (id: string) => (await rows<Record<string, any>>('SELECT state, intent_id FROM box_office_orders WHERE id = ?', id))[0]!
const deferred = async (h: House) => (await rows<{ total: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.deferred-ticket-income' AND e.performance_id = ?", h.performanceId))[0]!.total
const tickets = (orderId: string) => rows<{ state: string }>('SELECT t.state FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', orderId)
const keep = (intentId: string) => commit(unit => keepPayment(unit.view(), intentId, manager.accountId!))

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(() => ensureVocabularies('payments'))
  await commit(async (unit) => {
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await env.DB.prepare("UPDATE payments_provider_accounts SET active = ? WHERE provider = 'cash'").bind(1).run()
  })
  cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('a booking that lapsed after the till gave up on its payment', () => {
  it('stays as it is, and the money kept is ticket income for its performance', async () => {
    const h = await house(4, { startsAt: nowMs() + 20 * 60_000 })
    const r = await reserved(h, 2)
    const { intentId } = await givenUp(r, h)
    expect((await order(r.orderId)).state).toBe('expired')
    expect(await deferred(h)).toBe(0)
    const kept = await keep(intentId)
    expect(kept).toMatchObject({ keptMinor: r.totalMinor })
    expect((await order(r.orderId)).state).toBe('expired')
    expect(await tickets(r.orderId)).toEqual([])
    expect(await deferred(h)).toBe(-r.totalMinor)
    expect(await rows("SELECT action FROM core_audit WHERE record_type = 'box-office.order' AND record_id = ? AND detail LIKE '%kept%'", r.orderId)).toHaveLength(1)
  })
})

describe('a reservation still waiting', () => {
  it('is confirmed with the money kept, its tickets issued', async () => {
    const h = await house(4)
    const r = await reserved(h, 1)
    const { intentId } = await givenUp(r)
    expect((await order(r.orderId)).state).toBe('reserved')
    await keep(intentId)
    expect(await order(r.orderId)).toMatchObject({ state: 'confirmed', intent_id: intentId })
    expect(await tickets(r.orderId)).toEqual([{ state: 'valid' }])
    expect(await deferred(h)).toBe(-r.totalMinor)
  })

  it('refuses when it was paid another way since, changing nothing', async () => {
    const h = await house(4)
    const r = await reserved(h, 1)
    const { intentId, refundId } = await givenUp(r)
    const again = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input: { orderId: r.orderId, expectedTotalMinor: r.totalMinor } }] }, seller)
    await inContext(() => attest({ intentId: again.body.intentId, providerAccountId: cash, method: 'cash' }), seller)
    expect((await order(r.orderId)).state).toBe('confirmed')
    await expect(keep(intentId)).rejects.toMatchObject({ code: 'box-office.order.paid-another-way' })
    expect(await rows('SELECT state FROM payments_refunds WHERE id = ?', refundId)).toEqual([{ state: 'approved' }])
    expect(await deferred(h)).toBe(-r.totalMinor)
  })
})
