// Using a pass for tickets already booked (Matt, 19 November): a ticket the holder reserved for
// another show the pass covers becomes its entry where it stands, asked for while buying the pass or
// afterwards, one a performance and one a show where the pass says so, and only the holder's own.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { findOrCreateAccount } from '#modules/core'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import staffCoversGet from '../../server/api/box-office/passes/[id]/covers.get'
import staffCoversPost from '../../server/api/box-office/passes/[id]/covers.post'
import mineCoversGet from '../../server/api/box-office/passes/mine/[id]/covers.get'
import mineCoversPost from '../../server/api/box-office/passes/mine/[id]/covers.post'
import { createBasket, type Basket, type BasketInput } from '../../server/baskets'
import { coverChoicesOnBuying } from '../../server/pass-covers'
import { listPassTypes, type PassType } from '../../server/passes'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, req, type House } from './stage'

const handle = server({
  'POST /api/box-office/pass-types': typesPost,
  'GET /api/box-office/passes/:id/covers': staffCoversGet,
  'POST /api/box-office/passes/:id/covers': staffCoversPost,
  'GET /api/box-office/passes/mine/:id/covers': mineCoversGet,
  'POST /api/box-office/passes/mine/:id/covers': mineCoversPost,
})
const staff = person(['box-office.pass.manage', 'box-office.order.exchange'])
const line = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_order_lines WHERE id = ?', id))[0]!
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!
const passOn = async (orderId: string) => (await rows<Record<string, any>>('SELECT p.* FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE l.order_id = ?', orderId))[0]!
const coversOf = async (passId: string) => rows<Record<string, any>>('SELECT * FROM box_office_pass_covers WHERE pass_id = ? ORDER BY created_at, id', passId)
const passRow = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_passes WHERE id = ?', id))[0]!
const deferred = async (performanceId: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = \'box-office.deferred-ticket-income\' AND e.performance_id = ?', performanceId))[0]!.total
const passIncomeFrom = async (orderId: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id JOIN finance_postings p ON p.id = e.posting_id WHERE a.system_key = \'box-office.pass-income\' AND p.source_id = ? AND p.kind = \'transfer\'', orderId))[0]!.total
let card: string

let a: House
let b: House
let c: House
let keys = 0
let names = 0
let people = 0
async function passType(fields: Record<string, unknown> = {}): Promise<PassType> {
  const made = await call(handle, 'POST', '/api/box-office/pass-types', { actor: staff, headers: { 'idempotency-key': `pc${++keys}` }, body: { name: `Cover ${++names}`, covers: 'productions', productionIds: [a.productionId, b.productionId, c.productionId], perShow: 'once', onSale: true, prices: [{ name: 'Adult', amountMinor: 3500, insteadOf: [a.fullId] }], ...fields } })
  const body = await made.json() as { id: string }
  expect(made.status, JSON.stringify(body)).toBe(200)
  return (await inContext(() => listPassTypes())).find(t => t.id === body.id)!
}
async function someone() {
  const accountId = await inContext(async () => {
    const unit = createUnit()
    const made = await findOrCreateAccount(unit.view(), { address: `coverer${++people}@example.org`, origin: 'guest' })
    await unit.commit()
    return made.accountId
  })
  return person([], { accountId })
}
async function hold(input: BasketInput, actor: ReturnType<typeof person>): Promise<Basket> {
  resetRateLimits()
  return inContext(async () => {
    const unit = createUnit()
    const made = await createBasket(unit.view(), input)
    await unit.commit()
    return made
  }, actor)
}
async function refusedHold(input: BasketInput, actor: ReturnType<typeof person>): Promise<string> {
  try {
    await hold(input, actor)
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return error.code
  }
  throw new Error('The basket was held')
}
async function reserve(basket: Basket, actor: ReturnType<typeof person>) {
  const done = await req('POST', `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: basket.totalMinor, ageConfirmed: true }, actor, { 'x-basket-token': basket.token })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  return done.body
}
/** A reservation of `quantity` full-price tickets at a house, for this person: its order and line ids. */
async function reserved(h: House, who: ReturnType<typeof person>, quantity = 1) {
  const basket = await hold({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity }] }, who)
  await reserve(basket, who)
  return { orderId: basket.orderId, lineIds: basket.lines.map(l => l.id) }
}
/** Tickets for a house, bought and paid for online by this person: its order and line ids. */
async function paidFor(h: House, who: ReturnType<typeof person>, quantity = 1) {
  const basket = await hold({ performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: h.fullId, quantity }] }, who)
  const started = await req('POST', `/api/box-office/baskets/${basket.orderId}/checkout`, { expectedTotalMinor: basket.totalMinor, ageConfirmed: true }, who, { 'x-basket-token': basket.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await inContext(async () => {
    const unit = createUnit()
    const attempt = addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: basket.totalMinor })
    await unit.commit()
    return attempt.id
  })
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
  expect(await order(basket.orderId)).toMatchObject({ state: 'confirmed' })
  return { orderId: basket.orderId, lineIds: basket.lines.map(l => l.id) }
}
async function boughtPass(type: PassType, who: ReturnType<typeof person>, at = a) {
  const basket = await hold({ performanceId: at.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] }, who)
  await reserve(basket, who)
  return (await passOn(basket.orderId)).id as string
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(30)
  b = await house(30)
  c = await house(30)
  await inContext(() => ensureManagedTicketTypes())
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare('INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, \'cardco\', \'CardCo\', \'["online"]\', \'live\', 1, ?, ?)').bind(card, NOV_16, NOV_16).run()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'box-office.checkout.payment-timing', 'buyer-chooses', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('buying a pass with tickets already reserved', () => {
  it('offers the holder\'s tickets for other shows it covers, and covers them once the pass is reserved', async () => {
    const type = await passType()
    const who = await someone()
    const earlier = await reserved(b, who)
    const offered = await inContext(() => coverChoicesOnBuying(a.performanceId, type.id, type.prices[0]!.id, 1, who.accountId!))
    expect(offered).toMatchObject({ choices: [{ lineId: earlier.lineIds[0], orderId: earlier.orderId, amountMinor: 1200, paid: false }], others: 0 })

    const basket = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }], cover: earlier.lineIds }, who)
    expect(basket.totalMinor).toBe(3500)
    // Nothing changes until the booking buying the pass is reserved.
    expect(await line(earlier.lineIds[0]!)).toMatchObject({ amount_minor: 1200, pass_redemption_id: null })
    await reserve(basket, who)

    const pass = await passOn(basket.orderId)
    expect(await line(earlier.lineIds[0]!)).toMatchObject({ amount_minor: 0, state: 'live', pass_redemption_id: expect.any(String) })
    expect(pass.uses_taken).toBe(2)
    expect(await coversOf(pass.id)).toMatchObject([{ line_id: earlier.lineIds[0], state: 'applied', was_minor: 1200, credit_minor: 0 }])
    // The earlier reservation had nothing else to pay for: it is confirmed and its ticket issued.
    expect(await order(earlier.orderId)).toMatchObject({ state: 'confirmed', total_minor: 0 })
    expect(await rows('SELECT id FROM box_office_tickets WHERE order_line_id = ? AND state = \'valid\'', earlier.lineIds[0])).toHaveLength(1)
  })

  it('refuses a ticket that is someone else\'s, or for the show the pass gives its first entry at', async () => {
    const type = await passType()
    const who = await someone()
    const other = await someone()
    const theirs = await reserved(b, other)
    const tonight = await reserved(a, who)
    const buy = [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }]
    expect(await refusedHold({ performanceId: a.performanceId, lines: [], buy, cover: theirs.lineIds }, who)).toBe('box-office.pass.cover-not-yours')
    expect(await refusedHold({ performanceId: a.performanceId, lines: [], buy, cover: tonight.lineIds }, who)).toBe('box-office.pass.cover-too-many')
  })

  it('lets a switch go when the ticket changed before the booking buying the pass was reserved', async () => {
    const type = await passType()
    const who = await someone()
    const earlier = await reserved(b, who)
    const basket = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }], cover: earlier.lineIds }, who)
    const cancelled = await req('POST', `/api/box-office/orders/${earlier.orderId}/cancel`, { refund: 'none' }, person(['box-office.order.cancel']))
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    await reserve(basket, who)
    const pass = await passOn(basket.orderId)
    expect(await coversOf(pass.id)).toMatchObject([{ state: 'lapsed' }])
    expect(pass.uses_taken).toBe(1)
  })
})

describe('using a pass already held', () => {
  it('covers one ticket a show from the holder\'s passes page, and the rest stay as they are', async () => {
    const type = await passType()
    const who = await someone()
    const passId = await boughtPass(type, who)
    const two = await reserved(c, who, 2)
    const later = await reserved(await house(30, { of: c }), who)
    const asked = await call(handle, 'GET', `/api/box-office/passes/mine/${passId}/covers`, { actor: who })
    const choices = await asked.json() as { choices: { lineId: string }[], others: number }
    expect(asked.status, JSON.stringify(choices)).toBe(200)
    expect(choices.choices).toHaveLength(1)
    expect(choices.others).toBe(2)
    expect(two.lineIds).toContain(choices.choices[0]!.lineId)

    const both = await call(handle, 'POST', `/api/box-office/passes/mine/${passId}/covers`, { actor: who, headers: { 'idempotency-key': `pc${++keys}` }, body: { lineIds: [...two.lineIds] } })
    expect([both.status, (await both.json() as { code: string }).code]).toEqual([422, 'box-office.pass.cover-too-many'])
    const one = await call(handle, 'POST', `/api/box-office/passes/mine/${passId}/covers`, { actor: who, headers: { 'idempotency-key': `pc${++keys}` }, body: { lineIds: [choices.choices[0]!.lineId] } })
    expect(one.status, JSON.stringify(await one.clone().json())).toBe(200)
    // The other ticket on that booking is still to pay for, and the booking still waits at the box office.
    expect(await order(two.orderId)).toMatchObject({ state: 'reserved', total_minor: 1200 })
    expect(await line(later.lineIds[0]!)).toMatchObject({ amount_minor: 1200, pass_redemption_id: null })
    // Nothing is offered once the pass has an entry for that show.
    const again = await (await call(handle, 'GET', `/api/box-office/passes/mine/${passId}/covers`, { actor: who })).json() as { choices: unknown[] }
    expect(again.choices).toHaveLength(0)
  })

  it('is not opened by anyone but the holder, and staff may cover from the holders list', async () => {
    const type = await passType()
    const who = await someone()
    const passId = await boughtPass(type, who)
    const earlier = await reserved(b, who)
    expect((await call(handle, 'GET', `/api/box-office/passes/mine/${passId}/covers`, { actor: await someone() })).status).toBe(404)
    const listed = await (await call(handle, 'GET', `/api/box-office/passes/${passId}/covers`, { actor: staff })).json() as { choices: { lineId: string }[] }
    expect(listed.choices.map(c => c.lineId)).toEqual(earlier.lineIds)
    const done = await call(handle, 'POST', `/api/box-office/passes/${passId}/covers`, { actor: staff, headers: { 'idempotency-key': `pc${++keys}` }, body: { lineIds: earlier.lineIds } })
    expect(done.status).toBe(200)
    expect(await coversOf(passId)).toMatchObject([{ state: 'applied', by: staff.accountId }])
  })
})

describe('tickets already paid for', () => {
  it('takes what a paid ticket cost off a pass bought later, and moves that money to Pass income', async () => {
    const type = await passType()
    const who = await someone()
    const show = await house(30, { of: b })
    const paid = await paidFor(show, who)
    expect(await deferred(show.performanceId)).toBe(-1200)
    const offered = await inContext(() => coverChoicesOnBuying(a.performanceId, type.id, type.prices[0]!.id, 1, who.accountId!))
    expect(offered.choices).toMatchObject([{ lineId: paid.lineIds[0], amountMinor: 1200, paid: true, ask: false }])

    const basket = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }], cover: paid.lineIds }, who)
    expect(basket.totalMinor).toBe(2300)
    await reserve(basket, who)

    const pass = await passOn(basket.orderId)
    expect(pass).toMatchObject({ amount_minor: 3500, credit_minor: 1200, paid_at: null })
    expect(await rows('SELECT list_minor, discount_minor, amount_minor FROM box_office_order_lines WHERE order_id = ? AND kind = \'pass_sale\'', basket.orderId)).toEqual([{ list_minor: 3500, discount_minor: 1200, amount_minor: 2300 }])
    expect(await line(paid.lineIds[0]!)).toMatchObject({ amount_minor: 0, state: 'live', pass_redemption_id: expect.any(String) })
    expect(await order(paid.orderId)).toMatchObject({ state: 'confirmed', total_minor: 0 })
    expect(await rows('SELECT id FROM box_office_tickets WHERE order_line_id = ? AND state = \'valid\'', paid.lineIds[0])).toHaveLength(1)
    expect(await coversOf(pass.id)).toMatchObject([{ state: 'applied', was_minor: 1200, credit_minor: 1200 }])
    // The show no longer owes that money to the audience: the pass has it.
    expect(await deferred(show.performanceId)).toBe(0)
    expect(await passIncomeFrom(paid.orderId)).toBe(-1200)
  })

  it('leaves a paid ticket costing more than the pass owes to the box office', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 1000 }] })
    const who = await someone()
    const paid = await paidFor(await house(30, { of: b }), who)
    const offered = await inContext(() => coverChoicesOnBuying(a.performanceId, type.id, type.prices[0]!.id, 1, who.accountId!))
    expect(offered.choices).toMatchObject([{ lineId: paid.lineIds[0], paid: true, ask: true }])
    expect(await refusedHold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }], cover: paid.lineIds }, who)).toBe('box-office.pass.cover-ask')
  })

  it('brings down the reservation waiting to collect a pass\'s money, from the holder\'s passes page', async () => {
    const type = await passType()
    const who = await someone()
    const passId = await boughtPass(type, who)
    const waiting = (await rows<{ order_id: string }>('SELECT l.order_id FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE p.id = ?', passId))[0]!.order_id
    expect(await order(waiting)).toMatchObject({ state: 'reserved', total_minor: 3500 })
    const paid = await paidFor(await house(30, { of: c }), who)
    const done = await call(handle, 'POST', `/api/box-office/passes/mine/${passId}/covers`, { actor: who, headers: { 'idempotency-key': `pc${++keys}` }, body: { lineIds: paid.lineIds } })
    expect(done.status, JSON.stringify(await done.clone().json())).toBe(200)
    expect(await order(waiting)).toMatchObject({ state: 'reserved', total_minor: 2300 })
    expect(await passRow(passId)).toMatchObject({ credit_minor: 1200, paid_at: null })
    expect(await order(paid.orderId)).toMatchObject({ state: 'confirmed', total_minor: 0 })
  })

  it('pays a pass whose credit reaches its price, and confirms the reservation that was to collect it', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 1200 }] })
    const who = await someone()
    const passId = await boughtPass(type, who)
    const waiting = (await rows<{ order_id: string }>('SELECT l.order_id FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE p.id = ?', passId))[0]!.order_id
    const paid = await paidFor(await house(30, { of: b }), who)
    const done = await call(handle, 'POST', `/api/box-office/passes/mine/${passId}/covers`, { actor: who, headers: { 'idempotency-key': `pc${++keys}` }, body: { lineIds: paid.lineIds } })
    expect(done.status, JSON.stringify(await done.clone().json())).toBe(200)
    expect(await passRow(passId)).toMatchObject({ credit_minor: 1200, paid_at: expect.any(Number) })
    expect(await order(waiting)).toMatchObject({ state: 'confirmed', total_minor: 0 })
    // Paid in full, the pass offers no more paid tickets but to the box office.
    const later = await paidFor(await house(30, { of: c }), who)
    const asked = await (await call(handle, 'GET', `/api/box-office/passes/mine/${passId}/covers`, { actor: who })).json() as { choices: { lineId: string, ask: boolean }[] }
    expect(asked.choices).toMatchObject([{ lineId: later.lineIds[0], ask: true }])
  })
})
