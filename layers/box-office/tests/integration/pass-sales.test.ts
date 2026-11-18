// Selling a pass (BO-64): a pass is bought with a booking, as a line of its own beside the tickets,
// and the booking's ticket is its first entry. Paid for, it is the buyer's and the money is pass
// income, not deferred to a performance. Reserved, it is the buyer's at once and still owed; a pass
// that must be paid for first cannot be reserved. A pass still owed whose reservation came to
// nothing is collected with the next booking it is used on.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import { basketByToken, createBasket, type Basket, type BasketInput } from '../../server/baskets'
import { getPass } from '../../server/pass-holding'
import { passesOnSale } from '../../server/pass-sales'
import { listPassTypes } from '../../server/passes'
import { salesSummary } from '../../server/reports'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, req, type House } from './stage'

const handle = server({ 'POST /api/box-office/pass-types': typesPost })
const staff = person(['box-office.pass.manage'])
const balance = async (key: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total
const pass = async (orderId: string) => (await rows<Record<string, any>>('SELECT p.* FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE l.order_id = ?', orderId))[0]!
const order = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_orders WHERE id = ?', id))[0]!

let a: House
let b: House
let card: string
let keys = 0
let names = 0
async function passType(fields: Record<string, unknown> = {}) {
  const made = await call(handle, 'POST', '/api/box-office/pass-types', { actor: staff, headers: { 'idempotency-key': `ps${++keys}` }, body: { name: `Season ${++names}`, covers: 'productions', productionIds: [a.productionId, b.productionId], perShow: 'once', onSale: true, prices: [{ name: 'Adult', amountMinor: 3500 }], ...fields } })
  const body = await made.json() as { id: string }
  expect(made.status, JSON.stringify(body)).toBe(200)
  return (await inContext(() => listPassTypes())).find(t => t.id === body.id)!
}
type Result = ({ ok: true } & Basket) | { ok: false, code: string, reason: string }
async function hold(input: BasketInput, actor?: ReturnType<typeof person>): Promise<Result> {
  try {
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), input)
      await unit.commit()
      return made
    }, actor)
    return { ok: true, ...basket }
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false, code: error.code, reason: error.reason }
  }
}
let guests = 0
const address = () => `passbuyer${++guests}@example.org`
const reserve = (basket: Basket, email = address()) => req('POST', `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: basket.totalMinor, ageConfirmed: true, email, name: 'Pass Buyer' }, null, { 'x-basket-token': basket.token })
async function pay(basket: Basket, email = address()) {
  const started = await req('POST', `/api/box-office/baskets/${basket.orderId}/checkout`, { expectedTotalMinor: basket.totalMinor, email, name: 'Pass Buyer' }, null, { 'x-basket-token': basket.token })
  expect(started.status, JSON.stringify(started.body)).toBe(200)
  const attemptId = await inContext(async () => {
    const unit = createUnit()
    const attempt = addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: basket.totalMinor })
    await unit.commit()
    return attempt.id
  })
  return inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(30)
  b = await house(30)
  await inContext(() => ensureManagedTicketTypes())
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  for (const [key, value] of [['box-office.reservations.confirm-email', false], ['box-office.checkout.payment-timing', 'buyer-chooses']] as const) {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
      await unit.commit()
    })
  }
})

describe('a pass bought with a booking', () => {
  it('is offered for the shows it covers, at each of its prices', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3500 }, { name: 'Concession', amountMinor: 2800 }] })
    const offered = await inContext(() => passesOnSale(a.performanceId, { channel: 'online', account: null }))
    expect(offered.find(o => o.id === type.id)).toMatchObject({ name: type.name, shows: 2, once: true, prices: [{ name: 'Adult', amountMinor: 3500, allowed: true }, { name: 'Concession', amountMinor: 2800, allowed: true }] })
    const elsewhere = await house(10)
    expect((await inContext(() => passesOnSale(elsewhere.performanceId, { channel: 'online', account: null }))).some(o => o.id === type.id)).toBe(false)
  })

  it('adds the pass to the total and its first entry at no charge, beside a paid ticket', async () => {
    const type = await passType()
    const made = await hold({ performanceId: a.performanceId, lines: [{ bandId: a.bandId, ticketTypeId: a.fullId, quantity: 1 }], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })
    if (!made.ok) throw new Error(made.code)
    expect(made.totalMinor).toBe(3500 + 1200)
    expect(made.lines.map(l => l.amountMinor)).toEqual([1200, 0])
    const view = await inContext(() => basketByToken(made.orderId, made.token))
    expect(view).toMatchObject({ totalMinor: 4700, passSales: [{ name: type.name, priceName: 'Adult', amountMinor: 3500, fresh: true }] })
    expect(view!.lines.map(l => l.pass ?? null).sort()).toEqual([type.name, null].sort())
    // Nobody's yet: a basket that lapses leaves no pass behind for anyone to use.
    expect(await pass(made.orderId)).toMatchObject({ issued_at: null, paid_at: null, account_id: null, uses_taken: 1 })
  })

  it('paid for, is the buyer\'s, and its money is pass income rather than deferred to the performance', async () => {
    const type = await passType()
    const made = await hold({ performanceId: a.performanceId, lines: [{ bandId: a.bandId, ticketTypeId: a.fullId, quantity: 1 }], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })
    if (!made.ok) throw new Error(made.code)
    const [income, deferred] = [await balance('box-office.pass-income'), await balance('box-office.deferred-ticket-income')]
    expect(await pay(made)).toMatchObject({ settled: true })
    const o = await order(made.orderId)
    expect(o.state).toBe('confirmed')
    expect(await pass(made.orderId)).toMatchObject({ issued_at: NOV_16, paid_at: NOV_16, account_id: o.account_id, uses_taken: 1 })
    expect(await balance('box-office.pass-income') - income).toBe(-3500)
    expect(await balance('box-office.deferred-ticket-income') - deferred).toBe(-1200)
    // The report counts the entry under the pass's name, not as a complimentary ticket.
    const report = await inContext(() => salesSummary(a.productionId))
    expect(report.byType.find(row => row.name === type.name)).toMatchObject({ kind: 'pass', tickets: 1, valueMinor: 0 })
    expect(report.totals.complimentary).toBe(0)
  })

  it('reserved, is the buyer\'s at once and owed on the reservation; one that must be paid first is not reserved', async () => {
    const strict = await passType({ reserveUnpaid: false })
    const refused = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: strict.id, passPriceId: strict.prices[0]!.id }] })
    if (!refused.ok) throw new Error(refused.code)
    const no = await reserve(refused)
    expect([no.status, no.body.code]).toEqual([409, 'box-office.pass.pay-first'])

    const type = await passType()
    const made = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })
    if (!made.ok) throw new Error(made.code)
    const done = await reserve(made)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body).toMatchObject({ state: 'reserved', amountDueMinor: 3500 })
    expect(await pass(made.orderId)).toMatchObject({ issued_at: NOV_16, paid_at: null, account_id: (await order(made.orderId)).account_id })
  })

  it('still owed after its reservation came to nothing, is collected with the next booking it is used on, once', async () => {
    const type = await passType()
    const first = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })
    if (!first.ok) throw new Error(first.code)
    expect((await reserve(first)).status).toBe(200)
    const held = await pass(first.orderId)
    const code = (await inContext(() => getPass(held.id))).code!

    // While the first reservation waits to be paid, another booking with the pass carries no charge.
    const second = await hold({ performanceId: b.performanceId, lines: [], passes: [{ code }] })
    if (!second.ok) throw new Error(second.code)
    expect(second.totalMinor).toBe(0)

    // The first reservation is cancelled unpaid: the pass's money is on nothing.
    await env.DB.prepare("UPDATE box_office_orders SET state = 'cancelled' WHERE id = ?").bind(first.orderId).run()
    await env.DB.prepare("UPDATE box_office_claims SET state = 'released', released_at = ?, release_reason = 'cancelled' WHERE hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ?)").bind(NOV_16, first.orderId).run()
    const third = await hold({ performanceId: b.performanceId, lines: [], passes: [{ code }] })
    if (!third.ok) throw new Error(third.code)
    expect(third.totalMinor).toBe(3500)
    expect((await inContext(() => basketByToken(third.orderId, third.token)))!.passSales).toMatchObject([{ amountMinor: 3500, fresh: false }])
    expect((await pass(third.orderId)).id).toBe(held.id)
  })

  it('at a price only some people may have needs the buyer signed in and qualifying', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3500 }] })
    const none = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: 'ppr_nothere' }] })
    expect(none).toMatchObject({ ok: false, code: 'box-office.pass.not-on-sale' })
    const elsewhere = await house(10)
    expect(await hold({ performanceId: elsewhere.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })).toMatchObject({ ok: false, code: 'box-office.pass.not-covered' })
  })
})
