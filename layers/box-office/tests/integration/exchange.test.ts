// Exchanging tickets (BO-54): the new seats are claimed and the old released in one batch, so a full
// house leaves the buyer with what they had; old codes stop working and new ones are sent; the money
// stays deferred, now for the new performance; a cheaper exchange refunds the difference, which needs
// the refund ability; one that costs more is paid for at the till, which holds the new seats and
// makes the exchange when the difference settles, and a later refund draws on both payments.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, openSpecial, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { addAttempt } from '../../../payments/server/answers'
import { attest, cancelIntent, openSession, recordAnswer } from '../../../payments/server/services'
import { listTerms } from '#modules/core'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { deliver, env, inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const exchanger = person(['box-office.order.exchange'])
const manager = person(['box-office.order.exchange', 'box-office.order.refund', 'box-office.order.cancel', 'box-office.order.view', 'payments.session.open', 'payments.attempt.attest'])
const steward = person(['box-office.ticket.admit'])
const balance = async (key: string, performanceId: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ? AND e.performance_id = ?', key, performanceId))[0]!.total
const claimed = async (h: House) => (await rows<{ claimed: number }>('SELECT claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!.claimed
const lineIds = async (orderId: string) => (await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", orderId)).map(r => r.id)
const DEFERRED = 'box-office.deferred-ticket-income'
let card: string
let cash: string
let reason: string
let guests = 0

function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function codesSent(orderId: string, type: string): Promise<string[]> {
  const found = await rows<{ sealed_variables: string }>('SELECT sealed_variables FROM core_notifications WHERE type_key = ? AND subject_id = ? ORDER BY created_at DESC', type, orderId)
  return (JSON.parse((await inContext(() => openSpecial(found[0]!.sealed_variables)))!).codes as string).split('\n\n')
}

/** An order paid online by card. */
async function paid(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const b = made.basket
  const started = await req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: b.totalMinor, email: `exchange${++guests}@example.org`, name: 'Swapping Guest' }, null, { 'x-basket-token': b.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await commit(async unit => addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: b.totalMinor }).id)
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
  return { orderId: b.orderId, lines: await lineIds(b.orderId), codes: await codesSent(b.orderId, 'box-office.order-confirmed') }
}

const exchange = (orderId: string, body: Record<string, unknown>, actor = manager) => req('POST', `/api/box-office/orders/${orderId}/exchange`, body, actor)
const scan = (h: House, code: string) => req('POST', `/api/box-office/performances/${h.performanceId}/scan`, { code }, steward)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await commit(async (unit) => {
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'payments.refunds.self-approve-up-to', 5000, { reason: 'test', confirm: true })
  })
  world.refundAnswer = { state: 'succeeded', providerRef: 're_exchange' }
  cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
  reason = (await inContext(() => listTerms('box-office.cancellation-reason'))).find(t => t.slug === 'cannot-attend')!.id
  await commit(unit => openSession(unit.view(), { accountId: manager.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

const till = (input: Record<string, unknown>) => req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }] }, manager)
const payCash = (intentId: string) => inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash' }), manager)

describe('exchanging tickets', () => {
  it('moves tickets to another performance at the same price: seats, codes and deferred money all move', async () => {
    const from = await house(5)
    const to = await house(5)
    const o = await paid(from, 2)
    const target = { performanceId: to.performanceId, bandId: to.bandId, ticketTypeId: to.fullId }
    expect((await exchange(o.orderId, { lineIds: o.lines, ...target, preview: true }, exchanger)).body).toMatchObject({ oldMinor: 2400, newMinor: 2400, differenceMinor: 0 })

    const done = await exchange(o.orderId, { lineIds: o.lines, ...target }, exchanger)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ totalMinor: 2400, refund: null })
    expect(await claimed(from)).toBe(0)
    expect(await claimed(to)).toBe(2)
    expect(await balance(DEFERRED, from.performanceId)).toBe(0)
    expect(await balance(DEFERRED, to.performanceId)).toBe(-2400)
    expect((await scan(from, o.codes[0]!)).body).toMatchObject({ result: 'void', voidReason: 'exchanged' })
    const fresh = await codesSent(o.orderId, 'box-office.order-exchanged')
    expect(fresh).toEqual(done.body.doorCodes)
    expect((await scan(to, fresh[0]!)).body.result).toBe('admitted')
    expect(await rows("SELECT id FROM box_office_cancellations WHERE order_id = ? AND kind = 'exchange'", o.orderId)).toHaveLength(1)
  })

  it('refunds a cheaper exchange\'s difference, which needs the refund ability too', async () => {
    const h = await house(5)
    const o = await paid(h, 2)
    const cheaper = { lineIds: o.lines, performanceId: h.performanceId, bandId: h.bandId, ticketTypeId: h.concessionId }
    expect((await exchange(o.orderId, cheaper, exchanger)).status).toBe(403)
    const done = await exchange(o.orderId, cheaper)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body.totalMinor).toBe(1600)
    expect(done.body.refund).toMatchObject({ amountMinor: 800 })
    expect(await claimed(h)).toBe(2)
    await deliver()
    expect(await balance(DEFERRED, h.performanceId)).toBe(-1600)

    // Back again would cost more: refused here, and nothing changes.
    const back = await exchange(o.orderId, { lineIds: await lineIds(o.orderId), performanceId: h.performanceId, bandId: h.bandId, ticketTypeId: h.fullId })
    expect(back.body).toMatchObject({ code: 'box-office.exchange.costs-more' })
  })

  it('takes the difference on a dearer exchange at the till and makes the exchange when it is paid', async () => {
    const h = await house(5)
    const o = await paid(h, 2)
    const cheaper = await exchange(o.orderId, { lineIds: o.lines, performanceId: h.performanceId, bandId: h.bandId, ticketTypeId: h.concessionId })
    expect(cheaper.body.refund).toMatchObject({ amountMinor: 800 })
    await deliver()
    const concession = await lineIds(o.orderId)
    const dearer = { orderId: o.orderId, lineIds: concession, performanceId: h.performanceId, bandId: h.bandId, ticketTypeId: h.fullId }

    const summary = await req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input: { exchange: { ...dearer, expectedDifferenceMinor: 800 } } }] }, manager)
    expect(summary.status, JSON.stringify(summary.body)).toBe(200)
    expect(JSON.stringify(summary.body)).toContain('800')
    expect((await till({ exchange: { ...dearer, expectedDifferenceMinor: 100 } })).body).toMatchObject({ code: 'box-office.exchange.price-changed' })

    // The new seats are held while the payment is open; a payment that ends lets them go and changes nothing.
    const first = await till({ exchange: { ...dearer, expectedDifferenceMinor: 800 } })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(await claimed(h)).toBe(4)
    await commit(unit => cancelIntent(unit.view(), first.body.intentId))
    expect(await claimed(h)).toBe(2)
    expect(await lineIds(o.orderId)).toEqual(concession)

    const sale = await till({ exchange: { ...dearer, expectedDifferenceMinor: 800 } })
    expect(sale.status, JSON.stringify(sale.body)).toBe(200)
    expect(await payCash(sale.body.intentId)).toMatchObject({ settled: true })
    expect(await claimed(h)).toBe(2)
    const now = await rows<{ amount_minor: number, replaces_line_id: string }>("SELECT amount_minor, replaces_line_id FROM box_office_order_lines WHERE order_id = ? AND state = 'live' ORDER BY id", o.orderId)
    expect(now.map(l => l.amount_minor)).toEqual([1200, 1200])
    expect(now.map(l => l.replaces_line_id).sort()).toEqual([...concession].sort())
    expect((await rows<{ total_minor: number }>('SELECT total_minor FROM box_office_orders WHERE id = ?', o.orderId))[0]!.total_minor).toBe(2400)
    expect(await balance(DEFERRED, h.performanceId)).toBe(-2400)
    expect(await codesSent(o.orderId, 'box-office.order-exchanged')).toHaveLength(2)
    expect((await rows<{ state: string }>('SELECT state FROM box_office_exchanges WHERE order_id = ? ORDER BY created_at', o.orderId)).map(r => r.state)).toEqual(['released', 'completed'])

    // Cancelling it all refunds the whole price, from both payments: the difference first, then the rest.
    const cancelled = await req('POST', `/api/box-office/orders/${o.orderId}/cancel`, { refund: 'full', reasonTermId: reason }, manager)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body.refund).toMatchObject({ amountMinor: 2400 })
    const refunds = await rows<{ amount_minor: number, owner_record: string }>('SELECT r.amount_minor, p.owner_record FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.owner_record = ? OR p.owner_record LIKE \'exch_%\' AND p.owner_record IN (SELECT id FROM box_office_exchanges WHERE order_id = ?) ORDER BY r.created_at, r.amount_minor', o.orderId, o.orderId)
    expect(refunds.map(r => [r.owner_record.slice(0, 4), r.amount_minor])).toEqual([['ord_', 800], ['exch', 800], ['ord_', 1600]])
    // The card refunds go back through the provider; the cash is handed back by a person, and is still owed until they record it.
    await deliver()
    expect(await balance(DEFERRED, h.performanceId)).toBe(-800)
  })

  it('leaves the buyer with what they had when the new performance has just filled', async () => {
    const from = await house(5)
    const full = await house(1)
    const o = await paid(from, 1)
    await paid(full, 1)
    const refused = await exchange(o.orderId, { lineIds: o.lines, performanceId: full.performanceId, bandId: full.bandId, ticketTypeId: full.fullId })
    expect(refused.body.code).toMatch(/^box-office\.capacity\./)
    expect(await lineIds(o.orderId)).toEqual(o.lines)
    expect((await scan(from, o.codes[0]!)).body.result).toBe('admitted')
  })
})
