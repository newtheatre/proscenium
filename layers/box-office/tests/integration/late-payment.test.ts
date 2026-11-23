// A payment taken outside the site (Box office specification, part 4): a booking that lapsed unpaid
// whose buyer paid another way and came anyway. Once the performance is past selling, the money is
// recorded as an Other payment and is ticket income for it; the booking stays lapsed, and only once.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import releaseUnpaid from '../../server/api/box-office/performances/[id]/door/release-unpaid.post'
import recordPayment from '../../server/api/box-office/orders/[id]/record-payment.post'
import orderGet from '../../server/api/box-office/orders/[id]/index.get'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const door = person(['box-office.order.release', 'box-office.ticket.admit'])
const manager = person(['box-office.order.view', 'box-office.order.take-payment', 'payments.attempt.reconcile'])
const seller = person(['box-office.order.view', 'box-office.order.take-payment'])
const handle = server({
  'POST /api/box-office/performances/:id/door/release-unpaid': releaseUnpaid,
  'POST /api/box-office/orders/:id/record-payment': recordPayment,
  'GET /api/box-office/orders/:id': orderGet,
})
let other: string
let guests = 0
const HOUR = 3_600_000

async function lapsed(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `late${++guests}@example.org`, name: 'Door Guest' }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  const released = await call(handle, 'POST', `/api/box-office/performances/${h.performanceId}/door/release-unpaid`, { actor: door, body: {}, headers: { 'idempotency-key': `lp${guests}` } })
  expect(released.status).toBe(200)
  return { orderId: made.basket.orderId as string, totalMinor: made.basket.totalMinor as number }
}

const record = (orderId: string, body: Record<string, unknown>, actor = manager) =>
  call(handle, 'POST', `/api/box-office/orders/${orderId}/record-payment`, { actor, body, headers: { 'idempotency-key': newId('req') } })
const orderState = async (id: string) => (await rows<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ?', id))[0]!.state
const deferred = async (h: House) => (await rows<{ total: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.deferred-ticket-income' AND e.performance_id = ?", h.performanceId))[0]!.total
const other_ = async () => (await rows<{ total: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'payments.other'"))[0]!.total

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await unit.commit()
  })
  other = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'other', 'Other payments', '[\"desk\"]', 'live', 1, ?, ?)").bind(other, NOV_16, NOV_16).run()
})

describe('a booking that lapsed unpaid but was paid for at the door', () => {
  it('is refused while the performance is still on sale, then recorded once as ticket income', async () => {
    const h = await house(4, { startsAt: nowMs() + 20 * 60_000 })
    const r = await lapsed(h, 2)
    expect(await orderState(r.orderId)).toBe('expired')
    const early = await record(r.orderId, { providerAccountId: other, note: 'SumUp app, card ending 1234' })
    expect(early.status).toBe(409)
    expect(await early.json()).toMatchObject({ code: 'box-office.order.still-on-sale' })

    setClock(nowMs() + 2 * HOUR)
    const before = await other_()
    const shown = await (await call(handle, 'GET', `/api/box-office/orders/${r.orderId}`, { actor: manager })).json() as any
    expect(shown.can.recordPayment).toBe(true)
    expect(shown.outsideAccounts).toEqual([{ id: other, label: 'Other payments' }])

    const done = await record(r.orderId, { providerAccountId: other, note: 'SumUp app, card ending 1234' })
    expect(done.status, await done.clone().text()).toBe(200)
    expect(await orderState(r.orderId)).toBe('expired')
    expect(await deferred(h)).toBe(-r.totalMinor)
    expect(await other_() - before).toBe(r.totalMinor)
    expect(await rows('SELECT a.method, a.state, a.note FROM payments_attempts a JOIN payments_intent_parts p ON p.intent_id = a.intent_id WHERE p.owner_record = ?', r.orderId))
      .toEqual([{ method: 'other_attested', state: 'succeeded', note: 'SumUp app, card ending 1234' }])

    const after = await (await call(handle, 'GET', `/api/box-office/orders/${r.orderId}`, { actor: manager })).json() as any
    expect(after.can.recordPayment).toBe(false)
    expect(after.payments).toMatchObject([{ amountMinor: r.totalMinor, methods: ['other_attested'] }])

    const again = await record(r.orderId, { providerAccountId: other, note: 'twice' })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'payments.outside.already-paid' })
    expect(await deferred(h)).toBe(-r.totalMinor)
  })

  it('needs someone who may answer for unconfirmed payments, a note, and a booking that lapsed', async () => {
    const h = await house(4, { startsAt: nowMs() + 20 * 60_000 })
    const r = await lapsed(h, 1)
    setClock(nowMs() + 2 * HOUR)
    expect((await record(r.orderId, { providerAccountId: other, note: 'SumUp app' }, seller)).status).toBe(403)
    expect((await record(r.orderId, { providerAccountId: other, note: '  ' })).status).toBe(422)
    const cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
    expect(await (await record(r.orderId, { providerAccountId: cash, note: 'SumUp app' })).json()).toMatchObject({ code: 'payments.attempt.method-unavailable' })
    expect(await deferred(h)).toBe(0)

    const live = await house(4, { startsAt: nowMs() + 20 * 60_000 })
    const made = await buy(live, 1)
    if (!made.ok) throw new Error(made.code)
    const reserved = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `late${++guests}@example.org`, name: 'Door Guest' }, null, { 'x-basket-token': made.basket.token })
    expect(reserved.body.state).toBe('reserved')
    expect(await (await record(made.basket.orderId, { providerAccountId: other, note: 'SumUp app' })).json()).toMatchObject({ code: 'box-office.order.not-lapsed' })
  })
})
