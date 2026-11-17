// Paying online (BO-10, BO-12, FIN-01; Box office specification, part 3, "An order", and part 4,
// "One payment with several owners"): checkout creates the intent and moves the seats into the
// payment window; when the money arrives, one batch confirms the order, issues a ticket for each
// line and posts the sale to deferred ticket income; a payment that ends without the money puts the
// seats back on sale; and an order with nothing to pay is confirmed at once with no posting.
import { beforeAll, describe, expect, it } from 'vitest'
import { advanceClock, createUnit, newId, openSpecial, setClock } from '#kit'
import { signing } from '#kit/signing'
import { resetRateLimits } from '#kit/ratelimit'
import { addAttempt } from '../../../payments/server/answers'
import { cancelIntent, recordAnswer } from '../../../payments/server/services'
import { expireIntent } from '../../../payments/server/tasks/expire-intents'
import { env, inContext, rows, setModule } from '../../../../tests/integration/helpers'
import { hashOf } from '../../server/codes'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const MINUTE = 60_000
const count = async (sql: string, ...params: unknown[]) => (await rows<{ n: number }>(sql, ...params))[0]!.n
const pool = async (h: House) => (await rows<{ id: string, capacity: number, claimed: number }>('SELECT id, capacity, claimed FROM box_office_pools WHERE performance_id = ?', h.performanceId))[0]!
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const balance = async (key: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total
const postings = () => count('SELECT count(*) AS n FROM finance_postings')
let card: string

async function basket(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(`no basket: ${made.code}`)
  return made.basket
}

let guests = 0
const address = () => `payer${++guests}@example.org`

function checkout(b: { orderId: string, token: string, totalMinor: number }, email: string | undefined = address(), total = b.totalMinor) {
  return req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: total, ...(email ? { email, name: 'Paying Guest' } : {}) }, null, { 'x-basket-token': b.token })
}

/** An attempt on the order's intent, as the provider's page would have made, and its answer. */
async function answer(intentId: string, amountMinor: number, state: 'succeeded' | 'failed') {
  const attemptId = await inContext(async () => {
    const unit = createUnit()
    const attempt = addAttempt(unit.view(), { intentId, providerAccountId: card, method: 'card_online', amountMinor })
    await unit.commit()
    return attempt.id
  })
  const out = await inContext(() => recordAnswer(attemptId, state === 'succeeded' ? { state, providerRef: `cc_${attemptId}` } : { state, failureCode: 'declined' }, { kind: 'poll' }))
  return { attemptId, ...out }
}

async function mail(typeKey: string, orderId: string): Promise<Record<string, string>> {
  const [row] = await rows<{ payload: string, sealed_variables: string | null }>('SELECT payload, sealed_variables FROM core_notifications WHERE type_key = ? AND subject_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', typeKey, orderId)
  expect(row, `no ${typeKey} message`).toBeTruthy()
  const sealed = row!.sealed_variables ? JSON.parse((await inContext(() => openSpecial(row!.sealed_variables)))!) : {}
  return { ...JSON.parse(row!.payload), ...sealed }
}

/** Sets a house's full price to nothing, so its tickets are free. */
async function free(h: House) {
  const set = await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 0 }] })
  expect(set.status, JSON.stringify(set.body)).toBe(200)
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

describe('with no online payment provider', () => {
  it('sends a paid basket to Reserve, and confirms a free one at once with its tickets and no posting', async () => {
    const h = await house(4)
    const paid = await basket(h, 1)
    expect((await checkout(paid)).body).toMatchObject({ code: 'box-office.checkout.reserve-only' })

    const f = await house(4)
    await free(f)
    const before = await postings()
    const b = await basket(f, 2)
    expect(b.totalMinor).toBe(0)
    const done = await checkout(b)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'confirmed', orderId: b.orderId, totalMinor: 0 })
    expect(done.body.doorCodes).toHaveLength(2)
    expect(await order(b.orderId)).toMatchObject({ state: 'confirmed', intent_id: null, expires_at: null })
    expect(await count("SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.state = 'valid'", b.orderId)).toBe(2)
    expect(await postings()).toBe(before)
    expect(await count('SELECT count(*) AS n FROM payments_intent_parts WHERE owner_record = ?', b.orderId)).toBe(0)
  })

  it('never lets an order with nothing to pay rest reserved', async () => {
    const f = await house(4)
    await free(f)
    const b = await basket(f, 1)
    const done = await req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: 0, email: address(), name: 'Free Guest' }, null, { 'x-basket-token': b.token })
    expect(done.body.state).toBe('confirm-email')
    const confirm = await mail('box-office.reservation-confirm', b.orderId)
    const pressed = await req('POST', '/api/box-office/reservations/confirm', { token: confirm.link!.slice(confirm.link!.lastIndexOf('/') + 1) }, null)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(200)
    expect(pressed.body.state).toBe('confirmed')
    expect(pressed.body.doorCodes).toHaveLength(1)
    expect((await order(b.orderId)).state).toBe('confirmed')
  })
})

describe('paying online', () => {
  beforeAll(async () => {
    await setModule('cardco', true)
    card = newId('ppa')
    await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  })

  it('confirms the order, issues the tickets and posts to deferred income in one batch when the money arrives', async () => {
    const h = await house(10)
    const b = await basket(h, 3)
    const deferred = await balance('box-office.deferred-ticket-income')
    const started = await checkout(b)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    expect(started.body).toMatchObject({ state: 'awaiting_payment', orderId: b.orderId, amountMinor: 3600, currency: 'GBP', expiresAt: NOV_16 + 15 * MINUTE })
    const intentId = started.body.intentId as string
    // The seats are in the payment window, under a hold nothing of Box office's will release.
    expect(await order(b.orderId)).toMatchObject({ state: 'awaiting_payment', intent_id: intentId, expires_at: NOV_16 + 15 * MINUTE })
    expect(await rows('SELECT DISTINCT c.state, c.expires_at, h.kind FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', b.orderId))
      .toEqual([{ state: 'held', expires_at: NOV_16 + 15 * MINUTE, kind: 'payment' }])
    expect(await rows('SELECT owner_module, owner_record, amount_minor FROM payments_intent_parts WHERE intent_id = ?', intentId)).toEqual([{ owner_module: 'box-office', owner_record: b.orderId, amount_minor: 3600 }])
    // Pressed again, there is no second payment.
    expect((await checkout(b)).status).toBe(409)

    // The buyer is sent to the provider's page.
    const pay = await req('POST', `/api/box-office/baskets/${b.orderId}/pay`, {}, null, { 'x-basket-token': b.token })
    expect(pay.status, JSON.stringify(pay.body)).toBe(200)
    expect(pay.body.next).toMatchObject({ kind: 'redirect' })
    const settled = await inContext(() => recordAnswer(pay.body.attemptId, { state: 'succeeded', providerRef: `cc_${pay.body.attemptId}` }, { kind: 'poll' }))
    expect(settled).toMatchObject({ changed: true, settled: true, unfulfilled: false })

    const o = await order(b.orderId)
    expect(o).toMatchObject({ state: 'confirmed', expires_at: null, total_minor: 3600 })
    expect(o.confirmed_at).not.toBeNull()
    expect(await rows('SELECT DISTINCT c.state, c.expires_at FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', b.orderId)).toEqual([{ state: 'confirmed', expires_at: null }])
    expect((await pool(h)).claimed).toBe(3)
    // The sale is owed to the audience until the performance has taken place.
    expect(await balance('box-office.deferred-ticket-income') - deferred).toBe(-3600)
    expect(await rows("SELECT e.amount_minor, e.performance_id, e.production_id FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.deferred-ticket-income' AND e.performance_id = ?", h.performanceId))
      .toEqual([{ amount_minor: -3600, performance_id: h.performanceId, production_id: h.productionId }])
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.confirmed' AND record_id = ?", b.orderId)).toBe(1)

    // One ticket for each line. The buyer's message has the door codes; the database has only hashes.
    const tickets = await rows<{ code_hash: string, key_id: string, state: string, performance_id: string }>('SELECT t.code_hash, t.key_id, t.state, t.performance_id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', b.orderId)
    expect(tickets).toHaveLength(3)
    const told = await mail('box-office.order-confirmed', b.orderId)
    expect(told).toMatchObject({ reference: b.reference, tickets: '3 × Full price' })
    expect(told.paid).toContain('36.00')
    const codes = told.codes!.split('\n\n')
    expect(codes).toHaveLength(3)
    const everything = JSON.stringify(await rows('SELECT * FROM box_office_tickets')) + JSON.stringify(await rows('SELECT payload FROM core_notifications WHERE subject_id = ?', b.orderId))
    for (const doorCode of codes) {
      const [kind, keyId, code, signature] = doorCode.split('.')
      expect(kind).toBe('tkt')
      expect(code).toMatch(/^[A-Z2-7]{26}$/)
      expect(await inContext(() => signing.verify('box-office.door-code', keyId!, `${kind}.${keyId}.${code}`, signature!))).toBe(true)
      expect(tickets.map(t => t.code_hash)).toContain(await hashOf(code!))
      expect(everything).not.toContain(code)
    }
    // The link in the message opens the order; the browser's token still shows what became of the basket.
    const link = told.link!.slice(told.link!.lastIndexOf('/') + 1)
    expect((await req('GET', '/api/box-office/orders/link', undefined, null, { 'x-order-token': link })).body).toMatchObject({ state: 'confirmed', amountDueMinor: 0 })
    expect((await req('GET', `/api/box-office/baskets/${b.orderId}`, undefined, null, { 'x-basket-token': b.token })).body).toMatchObject({ state: 'confirmed' })

    // The same answer again settles nothing more.
    expect(await inContext(() => recordAnswer(pay.body.attemptId, { state: 'succeeded' }, { kind: 'poll' }))).toMatchObject({ changed: false })
    expect(await count('SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', b.orderId)).toBe(3)
    expect(await balance('box-office.deferred-ticket-income') - deferred).toBe(-3600)
  })

  it('keeps the seats through the payment window, and puts them back on sale when the payment lapses', async () => {
    const h = await house(2)
    const b = await basket(h, 2)
    const started = await checkout(b)
    const before = await postings()
    // Past the basket's own hold, the seats are still this buyer's.
    advanceClock(12 * MINUTE)
    expect((await buy(h, 1)).ok).toBe(false)
    // Past the payment window too, only Payments ends the hold.
    advanceClock(10 * MINUTE)
    expect((await buy(h, 1)).ok).toBe(false)
    await inContext(() => expireIntent(started.body.intentId))
    expect(await order(b.orderId)).toMatchObject({ state: 'expired' })
    expect(await rows('SELECT DISTINCT c.state, c.release_reason FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id WHERE h.order_id = ?', b.orderId)).toEqual([{ state: 'released', release_reason: 'payment_failed' }])
    expect((await pool(h)).claimed).toBe(0)
    expect((await buy(h, 2)).ok).toBe(true)
    expect(await postings()).toBe(before)
    expect(await count("SELECT count(*) AS n FROM core_events WHERE name = 'box-office.order.expired' AND record_id = ?", b.orderId)).toBe(1)
    expect(await count('SELECT count(*) AS n FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', b.orderId)).toBe(0)
  })

  it('leaves the order waiting after a declined card, and lapses it when the payment is cancelled', async () => {
    const h = await house(2)
    const b = await basket(h, 1)
    const started = await checkout(b)
    expect(await answer(started.body.intentId, 1200, 'failed')).toMatchObject({ changed: true, settled: false })
    // Declined: the seats are still held and the buyer can try again.
    expect((await order(b.orderId)).state).toBe('awaiting_payment')
    expect((await pool(h)).claimed).toBe(1)
    await inContext(async () => {
      const unit = createUnit()
      await cancelIntent(unit.view(), started.body.intentId)
      await unit.commit()
    })
    expect((await order(b.orderId)).state).toBe('expired')
    expect((await pool(h)).claimed).toBe(0)
  })

  it('asks the provider at once when the buyer has just paid, and confirms the order without waiting for the webhook', async () => {
    const h = await house(5)
    const b = await basket(h, 2)
    expect((await checkout(b)).status).toBe(200)
    const pay = await req('POST', `/api/box-office/baskets/${b.orderId}/pay`, {}, null, { 'x-basket-token': b.token })
    expect(pay.status, JSON.stringify(pay.body)).toBe(200)
    const check = () => req('POST', `/api/box-office/baskets/${b.orderId}/check`, {}, null, { 'x-basket-token': b.token })
    // The provider has no answer yet: still waiting, and nothing is marked unknown.
    const waiting = await check()
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200)
    expect(waiting.body).toMatchObject({ state: 'awaiting_payment', totalMinor: 2400 })
    // The money arrives; the page's next check finds it and the order is confirmed.
    world.answers.set(`cc_${pay.body.attemptId}`, { state: 'succeeded', providerRef: `cc_${pay.body.attemptId}` })
    const paid = await check()
    expect(paid.body).toMatchObject({ state: 'confirmed', reference: b.reference })
    expect((await order(b.orderId)).state).toBe('confirmed')
    // Asked again after it settled, nothing changes.
    expect((await check()).body.state).toBe('confirmed')
    // The wrong token learns nothing.
    expect((await req('POST', `/api/box-office/baskets/${b.orderId}/check`, {}, null, { 'x-basket-token': 'nope' })).status).toBe(404)
  })

  it('refuses a total the buyer did not see, quoting both, and an order with no address to send tickets to', async () => {
    const h = await house(2)
    const b = await basket(h, 1)
    const wrong = await checkout(b, address(), 1000)
    expect(wrong.status).toBe(409)
    expect(wrong.body.code).toBe('box-office.order.total-changed')
    expect(wrong.body.reason).toContain('12.00')
    expect(wrong.body.reason).toContain('10.00')
    expect((await req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: 1200 }, null, { 'x-basket-token': b.token })).body).toMatchObject({ code: 'box-office.checkout.email-needed' })
    expect((await order(b.orderId)).state).toBe('basket')
    expect((await req('POST', `/api/box-office/baskets/${b.orderId}/pay`, {}, null, { 'x-basket-token': b.token })).body).toMatchObject({ code: 'box-office.checkout.not-awaiting' })
  })
})
