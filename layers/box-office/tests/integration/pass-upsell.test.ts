// Up-selling a pass (Matt, 18 November): a pass price says which ticket types it is offered instead
// of; the offer counts the covered shows still to come; a member price can be had by typing a member
// number rather than signing in; and a buyer with more than one pass sends one on after checkout.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import { scheme as memberScheme, req as membershipReq } from '../../../membership/tests/integration/stage'
import typesGet from '../../server/api/box-office/pass-types/index.get'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import { createBasket, type Basket, type BasketInput } from '../../server/baskets'
import { exchangeLines } from '../../server/exchange'
import { passesOnSale } from '../../server/pass-sales'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { listPassTypes } from '../../server/passes'
import { orderByLink, sendPassFromLink } from '../../server/reservations'
import { house, NOV_16, ready, req, type House } from './stage'

const handle = server({ 'GET /api/box-office/pass-types': typesGet, 'POST /api/box-office/pass-types': typesPost })
const staff = person(['box-office.pass.manage'])

let a: House
let b: House
let c: House
let card: string
let keys = 0
let names = 0
async function post(fields: Record<string, unknown>) {
  const made = await call(handle, 'POST', '/api/box-office/pass-types', { actor: staff, headers: { 'idempotency-key': `pu${++keys}` }, body: { name: `Up-sell ${++names}`, covers: 'productions', productionIds: [a.productionId, b.productionId, c.productionId], perShow: 'once', onSale: true, ...fields } })
  return { status: made.status, body: await made.json() as Record<string, any> }
}
async function passType(fields: Record<string, unknown>) {
  const made = await post(fields)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return (await inContext(() => listPassTypes())).find(t => t.id === made.body.id)!
}
type Result = ({ ok: true } & Basket) | { ok: false, code: string, reason: string }
async function hold(input: BasketInput, actor?: ReturnType<typeof person>): Promise<Result> {
  try {
    resetRateLimits()
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
async function pay(basket: Basket, email = `upsell${++guests}@example.org`) {
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
type Key = { orderId: string, accountId: string }
async function send(key: Key, passId: string, email: string) {
  try {
    return await inContext(async () => {
      const unit = createUnit()
      const done = await sendPassFromLink(unit.view(), key, passId, email)
      await unit.commit()
      return { ok: true as const, ...done }
    })
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false as const, code: error.code as string }
  }
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
  await setModule('membership', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
})

describe('a pass price offered instead of tickets', () => {
  it('keeps the ticket types it is offered instead of, from those people buy, and refuses any other', async () => {
    const listed = await call(handle, 'GET', '/api/box-office/pass-types', { actor: staff })
    const body = await listed.json() as { ticketTypes: { value: string, label: string }[] }
    expect(body.ticketTypes.map(t => t.value)).toEqual(expect.arrayContaining([a.fullId, a.concessionId]))
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3000, insteadOf: [a.fullId] }, { name: 'Concession', amountMinor: 2400, insteadOf: [a.concessionId] }] })
    expect(type.prices.map(p => p.insteadOf)).toEqual([[a.fullId], [a.concessionId]])
    expect(await post({ prices: [{ name: 'Adult', amountMinor: 3000, insteadOf: [newId('tty')] }] })).toMatchObject({ status: 422, body: { code: 'box-office.pass.unknown-ticket-type' } })
  })

  it('is offered with the covered shows still to come', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3000, insteadOf: [a.fullId] }] })
    const offered = (await inContext(() => passesOnSale(a.performanceId, { channel: 'online', account: null }))).find(o => o.id === type.id)
    expect(offered).toMatchObject({ ahead: 3, prices: [{ name: 'Adult', insteadOf: [a.fullId], allowed: true }] })
  })
})

describe('a member pass price by member number', () => {
  async function referenced() {
    const id = await memberScheme({ acceptsReference: true })
    expect((await membershipReq('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const added = await membershipReq('POST', `/api/membership/schemes/${id}/members`, { address: `pu${Math.random().toString(36).slice(2)}@example.org`, name: 'Ada Reference' })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    const mine = await membershipReq('GET', '/api/membership/mine', undefined, person([], { accountId: added.body.accountId }))
    return { accountId: added.body.accountId as string, number: mine.body.number.label as string }
  }

  it('is sold to someone not signed in who types a member number, and the pass is the member\'s', async () => {
    // A scheme that takes a member number switches the requirement on.
    const m = await referenced()
    const type = await passType({ prices: [{ name: 'Member', amountMinor: 2000, requirementRefs: ['membership:any'], insteadOf: [a.fullId] }] })
    const offered = (await inContext(() => passesOnSale(a.performanceId, { channel: 'online', account: null }))).find(o => o.id === type.id)
    expect(offered!.prices[0]).toMatchObject({ allowed: false, reference: expect.objectContaining({ label: expect.any(String) }) })
    const buy = (reference?: string) => ({ passTypeId: type.id, passPriceId: type.prices[0]!.id, ...(reference ? { reference } : {}) })
    expect(await hold({ performanceId: a.performanceId, lines: [], buy: [buy()] })).toMatchObject({ ok: false })
    expect(await hold({ performanceId: a.performanceId, lines: [], buy: [buy('M-999999')] })).toMatchObject({ ok: false, code: 'box-office.pass.reference-not-met' })
    expect(await hold({ performanceId: a.performanceId, lines: [], buy: [buy(m.number), buy(m.number)] })).toMatchObject({ ok: false, code: 'box-office.pass.reference-repeated' })
    const made = await hold({ performanceId: a.performanceId, lines: [], buy: [buy(m.number)] })
    if (!made.ok) throw new Error(`${made.code}: ${made.reason}`)
    expect(made.totalMinor).toBe(2000)
    expect(await pay(made)).toMatchObject({ settled: true })
    const [held] = await rows<{ account_id: string }>('SELECT p.account_id FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE l.order_id = ?', made.orderId)
    expect(held!.account_id).toBe(m.accountId)
  })
})

describe('passes sent on after checkout', () => {
  it('sends one of several to someone else, once, and never to the buyer', async () => {
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3000, insteadOf: [a.fullId] }] })
    const buy = { passTypeId: type.id, passPriceId: type.prices[0]!.id }
    const made = await hold({ performanceId: a.performanceId, lines: [], buy: [buy, buy] })
    if (!made.ok) throw new Error(made.code)
    const buyer = `upsell${++guests}@example.org`
    expect(await pay(made, buyer)).toMatchObject({ settled: true })
    const [owner] = await rows<{ account_id: string }>('SELECT account_id FROM box_office_orders WHERE id = ?', made.orderId)
    const token: Key = { orderId: made.orderId, accountId: owner!.account_id }
    const view = await inContext(() => orderByLink(token))
    expect(view!.passes).toHaveLength(2)
    expect(view!.passes!.every(p => p.buyers)).toBe(true)
    const [first, second] = view!.passes!
    expect(await send(token, first!.id, buyer)).toMatchObject({ ok: false, code: 'box-office.pass.send-to-self' })
    const sent = await send(token, first!.id, 'friend@example.org')
    expect(sent).toMatchObject({ ok: true })
    expect((sent as { passes: { id: string, buyers: boolean }[] }).passes.find(p => p.id === first!.id)!.buyers).toBe(false)
    expect(await send(token, first!.id, 'other@example.org')).toMatchObject({ ok: false, code: 'box-office.pass.sent-already' })
    expect(await send(token, 'pass_nothere', 'other@example.org')).toMatchObject({ ok: false, code: 'box-office.pass.not-found' })
    const [moved] = await rows<{ account_id: string }>('SELECT account_id FROM box_office_passes WHERE id = ?', first!.id)
    const [friend] = await rows<{ id: string }>("SELECT account_id AS id FROM core_account_emails WHERE address = 'friend@example.org'")
    expect(moved!.account_id).toBe(friend!.id)
    expect(second!.buyers).toBe(true)
  })
})

describe('a pass entry exchanged', () => {
  async function exchange(orderId: string, performanceId: string, lineId: string, bandId: string, ticketTypeId: string) {
    try {
      return await inContext(async () => {
        const unit = createUnit()
        const done = await exchangeLines(unit.view(), orderId, { performanceId, lines: [{ lineId, bandId, ticketTypeId }], by: 'acc_test' })
        await unit.commit()
        return { ok: true as const, ...done }
      })
    }
    catch (error: any) {
      if (error?.name !== 'Refusal') throw error
      return { ok: false as const, code: error.code as string }
    }
  }

  it('moves to another performance of the same show, still the pass\'s entry, and never to another show', async () => {
    const later = await house(5, { of: a })
    const type = await passType({ prices: [{ name: 'Adult', amountMinor: 3000 }] })
    const made = await hold({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id }] })
    if (!made.ok) throw new Error(made.code)
    expect(await pay(made)).toMatchObject({ settled: true })
    const [line] = await rows<{ id: string, band_id: string, ticket_type_id: string }>("SELECT id, band_id, ticket_type_id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' AND state = 'live'", made.orderId)
    // Another show is never an exchange, for a pass's entry or a ticket.
    expect(await exchange(made.orderId, b.performanceId, line!.id, b.bandId, line!.ticket_type_id)).toMatchObject({ ok: false, code: 'box-office.exchange.other-show' })
    const moved = await exchange(made.orderId, later.performanceId, line!.id, later.bandId, line!.ticket_type_id)
    expect(moved, JSON.stringify(moved)).toMatchObject({ ok: true, refund: null })
    const [now] = await rows<{ performance_id: string, amount_minor: number, ticket_type_id: string, pass_redemption_id: string }>("SELECT performance_id, amount_minor, ticket_type_id, pass_redemption_id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' AND state = 'live'", made.orderId)
    expect(now).toMatchObject({ performance_id: later.performanceId, amount_minor: 0, ticket_type_id: line!.ticket_type_id })
    const entries = await rows<{ id: string, performance_id: string, state: string }>('SELECT d.id, d.performance_id, d.state FROM box_office_pass_redemptions d JOIN box_office_passes p ON p.id = d.pass_id JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE l.order_id = ? ORDER BY d.created_at, d.state', made.orderId)
    expect(entries.map(e => [e.performance_id, e.state]).sort()).toEqual([[a.performanceId, 'released'], [later.performanceId, 'live']].sort())
    expect(entries.find(e => e.state === 'live')!.id).toBe(now!.pass_redemption_id)
    const [held] = await rows<{ uses_taken: number }>('SELECT p.uses_taken FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id WHERE l.order_id = ?', made.orderId)
    expect(held!.uses_taken).toBe(1)
  })
})
