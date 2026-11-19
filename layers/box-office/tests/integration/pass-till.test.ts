// Passes at the till (BO-64; Matt, 18 November): a pass scanned or typed in the find box gives one
// entry tonight, booked at once when there is nothing to pay; beside paid tickets, or with what an
// unpaid pass still owes, it goes through the till's payment. A new pass is sold at the till with its
// first entry tonight, or on its own, to the holder the seller picks; and a pass's money still owed
// is paid on its own.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { attest, openSession } from '../../../payments/server/services'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { createBasket } from '../../server/baskets'
import { issuePass } from '../../server/pass-holding'
import { listPassTypes } from '../../server/passes'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { deskHolder } from '../../server/desk'
import { members } from '../../../../tests/fixtures/modules/seats/server/contributions/core.requirement/seats'
import { house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.pass.manage', 'seats.members.look-up'])
let cash: string
let a: House
let b: House
let names = 0

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function passType(fields: Record<string, unknown> = {}) {
  const made = await req('POST', '/api/box-office/pass-types', { name: `Till pass ${++names}`, covers: 'productions', productionIds: [a.productionId], perShow: 'once', prices: [{ name: 'Member', amountMinor: 2100 }], onSale: true, ...fields }, seller)
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return (await inContext(() => listPassTypes())).find(t => t.id === made.body.id)!
}
const issue = (type: Awaited<ReturnType<typeof passType>>, paid = true, accountId: string | null = null) =>
  commit(unit => issuePass(unit.view(), { passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId, paid, issuedBy: null }))
const pass = async (id: string) => (await rows<Record<string, any>>('SELECT * FROM box_office_passes WHERE id = ?', id))[0]!
const sale = (input: Record<string, unknown>) => req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }] }, seller)
const summary = (input: Record<string, unknown>) => req('POST', '/api/payments/till/summary', { panels: [{ basket: 'box-office', input }] }, seller)
const payCash = (intentId: string, more: { split?: number, receipt?: { email: string } } = {}) => inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash', ...more }), seller)
const linesOf = (orderId: string) => rows<{ kind: string, amount_minor: number, entry: number }>('SELECT kind, amount_minor, pass_redemption_id IS NOT NULL AS entry FROM box_office_order_lines WHERE order_id = ? AND state = \'live\' ORDER BY kind, amount_minor DESC', orderId)
const passIncome = async () => (await rows<{ total: number }>("SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts f ON f.id = e.account_id WHERE f.system_key = 'box-office.pass-income'"))[0]!.total
const orderOf = async (intentId: string) => (await rows<{ id: string, state: string, account_id: string | null }>('SELECT id, state, account_id FROM box_office_orders WHERE intent_id = ?', intentId))[0]!

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(30)
  b = await house(30)
  await inContext(() => ensureManagedTicketTypes())
  cash = (await rows<{ id: string }>("SELECT id FROM payments_provider_accounts WHERE provider = 'cash'"))[0]!.id
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Desk', floatMinor: 0 }))
})

describe('a pass found at the till', () => {
  it('is shown with its holder and what it owes, and why it gives no entry when it cannot', async () => {
    const type = await passType()
    const holder = await commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address: 'till.holder@example.org', name: 'Asha Okafor', origin: 'guest' })).accountId)
    const owed = await issue(type, false, holder)
    const found = await req('GET', `/api/box-office/desk/pass?performanceId=${a.performanceId}&code=${encodeURIComponent(owed.code.toLowerCase())}`, undefined, seller)
    expect(found.body).toMatchObject({ code: owed.code, name: type.name, priceName: 'Member', holder: 'Asha Okafor', owedMinor: 2100, unusable: null })
    const elsewhere = await req('GET', `/api/box-office/desk/pass?performanceId=${b.performanceId}&code=${owed.code}`, undefined, seller)
    expect(elsewhere.body).toMatchObject({ owedMinor: 2100, unusable: { code: 'box-office.pass.not-covered' } })
    expect((await req('GET', `/api/box-office/desk/pass?performanceId=${a.performanceId}&code=PASS-ZZZZ-ZZZZ`, undefined, seller)).body.code).toBe('box-office.pass.unknown')
  })
})

describe('a pass entry with nothing to pay', () => {
  it('is booked and admitted at once, without the till', async () => {
    const type = await passType()
    const paid = await issue(type)
    const input = { performanceId: a.performanceId, lines: [], passes: [{ code: paid.code }], admit: true }
    expect((await summary(input)).body).toMatchObject({ amountMinor: 0, panels: [{ lines: [{ label: `${type.name} entry`, amountMinor: 0 }] }] })
    // The till takes no payment of nothing: the panel books it itself.
    expect((await sale(input)).body.code).toBe('box-office.desk.issue-instead')
    const issued = await req('POST', '/api/box-office/desk/issue', { sale: input }, seller)
    expect(issued.status, JSON.stringify(issued.body)).toBe(200)
    const o = (await rows<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ?', issued.body.orderId))[0]!
    expect(o.state).toBe('confirmed')
    expect(await rows('SELECT t.admitted_at IS NOT NULL AS admitted FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ?', issued.body.orderId)).toEqual([{ admitted: 1 }])
    expect((await pass(paid.id)).uses_taken).toBe(1)
    // The same pass again, for the same performance, is refused.
    expect((await req('POST', '/api/box-office/desk/issue', { sale: input }, seller)).body.code).toBe('box-office.pass.used-here')
  })

  it('is refused when there is something to pay', async () => {
    const owed = await issue(await passType(), false)
    const refused = await req('POST', '/api/box-office/desk/issue', { sale: { performanceId: a.performanceId, lines: [], passes: [{ code: owed.code }] } }, seller)
    expect(refused.body.code).toBe('box-office.desk.to-pay')
  })
})

describe('a pass at the till with something to pay', () => {
  it('goes beside paid tickets, and collects what an unpaid pass owes as pass income', async () => {
    const type = await passType()
    const owed = await issue(type, false)
    const made = await sale({ performanceId: a.performanceId, lines: [{ bandId: a.bandId, ticketTypeId: a.fullId, quantity: 1 }], passes: [{ code: owed.code }] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.amountMinor).toBe(1200 + 2100)
    const before = await passIncome()
    expect(await payCash(made.body.intentId)).toMatchObject({ settled: true })
    const order = await orderOf(made.body.intentId)
    expect(order.state).toBe('confirmed')
    expect(await linesOf(order.id)).toEqual([{ kind: 'pass_sale', amount_minor: 2100, entry: 0 }, { kind: 'ticket', amount_minor: 1200, entry: 0 }, { kind: 'ticket', amount_minor: 0, entry: 1 }])
    expect((await pass(owed.id)).paid_at).not.toBeNull()
    expect(await passIncome() - before).toBe(-2100)
  })
})

describe('selling a pass at the till', () => {
  it('gives its first entry tonight, to the holder the seller picked, who is sent its code', async () => {
    const type = await passType()
    const holder = await commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address: 'new.holder@example.org', origin: 'guest' })).accountId)
    const input = { performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId: holder }] }
    expect((await summary(input)).body.panels[0].lines).toEqual([{ label: `${type.name} entry`, amountMinor: 0 }, { label: `${type.name}, Member`, amountMinor: 2100, key: 'pass:0' }])
    const made = await sale(input)
    expect(made.body.amountMinor).toBe(2100)
    await payCash(made.body.intentId)
    const sold = (await rows<{ id: string, account_id: string, paid_at: number | null, issued_at: number | null, uses_taken: number }>('SELECT p.id, p.account_id, p.paid_at, p.issued_at, p.uses_taken FROM box_office_passes p JOIN box_office_order_lines l ON l.id = p.order_line_id JOIN box_office_orders o ON o.id = l.order_id WHERE o.intent_id = ?', made.body.intentId))[0]!
    expect(sold).toMatchObject({ account_id: holder, uses_taken: 1 })
    expect(sold.paid_at).not.toBeNull()
    expect(await rows("SELECT account_id FROM core_notifications WHERE type_key = 'box-office.pass-issued' AND account_id = ?", holder)).toHaveLength(1)
  })

  it('on its own, with no entry, even for a show it does not cover', async () => {
    const type = await passType()
    const input = { performanceId: b.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id, entry: false }] }
    const listed = await req('GET', `/api/box-office/desk/passes?performanceId=${b.performanceId}`, undefined, seller)
    expect(listed.body.passes.find((p: { id: string }) => p.id === type.id)).toMatchObject({ covers: false, prices: [{ name: 'Member', amountMinor: 2100, restricted: false }] })
    const made = await sale(input)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    const before = await passIncome()
    await payCash(made.body.intentId)
    const order = await orderOf(made.body.intentId)
    expect(order.state).toBe('confirmed')
    expect(await linesOf(order.id)).toEqual([{ kind: 'pass_sale', amount_minor: 2100, entry: 0 }])
    // Nobody was named for it: the after-sale panel shows its code to hand over.
    expect((await req('GET', `/api/box-office/desk/sold?intent=${made.body.intentId}`, undefined, seller)).body.orders).toMatchObject([{ performance: null, lines: [], passes: [{ name: type.name, priceName: 'Member', holder: null, code: expect.stringMatching(/^PASS-/) }] }])
    expect(await passIncome() - before).toBe(-2100)
  })
})

describe('a pass sold at the till to someone with tickets already reserved', () => {
  it('covers the tickets the seller left ticked once the sale is paid', async () => {
    const type = await passType({ productionIds: [a.productionId, b.productionId] })
    const holder = await commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address: 'covered.holder@example.org', origin: 'guest' })).accountId)
    const who = person([], { accountId: holder })
    const basket = await inContext(async () => {
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: b.performanceId, lines: [{ bandId: b.bandId, ticketTypeId: b.fullId, quantity: 1 }] })
      await unit.commit()
      return made
    }, who)
    expect((await req('POST', `/api/box-office/baskets/${basket.orderId}/reserve`, { expectedTotalMinor: basket.totalMinor, ageConfirmed: true }, who, { 'x-basket-token': basket.token })).status).toBe(200)
    const offered = await req('GET', `/api/box-office/desk/covers?performanceId=${a.performanceId}&passTypeId=${type.id}&passPriceId=${type.prices[0]!.id}&accountId=${holder}`, undefined, seller)
    expect(offered.body.choices.map((c: { lineId: string }) => c.lineId)).toEqual([basket.lines[0]!.id])

    const made = await sale({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id, accountId: holder }], cover: [basket.lines[0]!.id] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.amountMinor).toBe(2100)
    await payCash(made.body.intentId)
    expect(await linesOf(basket.orderId)).toEqual([{ kind: 'ticket', amount_minor: 0, entry: 1 }])
    expect((await rows<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ?', basket.orderId))[0]!.state).toBe('confirmed')
  })
})

describe('a pass in a sale split between people', () => {
  it('goes to whoever paid for it, unless the seller named its holder', async () => {
    const type = await passType()
    const named = await commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address: 'named.holder@example.org', origin: 'guest' })).accountId)
    const buy = (more: Record<string, unknown> = {}) => ({ passTypeId: type.id, passPriceId: type.prices[0]!.id, entry: false, ...more })
    const input = { performanceId: a.performanceId, lines: [{ bandId: a.bandId, ticketTypeId: a.fullId, quantity: 1 }], buy: [buy(), buy(), buy({ accountId: named })] }
    // Lines: the ticket, then each pass sold. Person 1 pays for the ticket and the first pass; person 2 for the other two.
    const made = await req('POST', '/api/payments/till/sale', { panels: [{ basket: 'box-office', input }], splits: [{ items: [{ basket: 'box-office', line: 0, quantity: 1 }, { basket: 'box-office', line: 1, quantity: 1 }] }, { items: [{ basket: 'box-office', line: 2, quantity: 1 }, { basket: 'box-office', line: 3, quantity: 1 }] }] }, seller)
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await payCash(made.body.intentId, { split: 2, receipt: { email: 'Second.Payer@example.org' } })
    expect(await payCash(made.body.intentId, { split: 1, receipt: { email: 'first.payer@example.org' } })).toMatchObject({ settled: true })
    const sold = await rows<{ account_id: string | null }>(`SELECT p.account_id FROM box_office_passes p
      JOIN box_office_order_lines l ON l.id = p.order_line_id JOIN box_office_orders o ON o.id = l.order_id WHERE o.intent_id = ? ORDER BY l.rowid`, made.body.intentId)
    const accountOf = (address: string) => commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address, origin: 'guest' })).accountId)
    expect(sold.map(p => p.account_id)).toEqual([await accountOf('first.payer@example.org'), await accountOf('second.payer@example.org'), named])
    for (const p of sold) expect(await rows("SELECT 1 FROM core_notifications WHERE type_key = 'box-office.pass-issued' AND account_id = ?", p.account_id)).toHaveLength(1)
  })
})

describe('paying what a pass owes on its own', () => {
  it('collects it, and refuses a pass paid for already', async () => {
    const type = await passType()
    const owed = await issue(type, false)
    const made = await sale({ performanceId: b.performanceId, lines: [], collect: [owed.code] })
    expect(made.body.amountMinor).toBe(2100)
    expect(await payCash(made.body.intentId)).toMatchObject({ settled: true })
    expect((await pass(owed.id)).paid_at).not.toBeNull()
    const again = await summary({ performanceId: b.performanceId, lines: [], collect: [owed.code] })
    expect(again.body.code).toBe('box-office.pass.paid')
  })
})

describe('a pass at a price only some people may have, sold at the till', () => {
  const memberType = () => passType({ prices: [{ name: 'Member', amountMinor: 2100, requirementRefs: ['seats:member'] }] })
  const person_ = async (address: string) => commit(async unit => (await (await import('#modules/core')).findOrCreateAccount(unit.view(), { address, origin: 'guest' })).accountId)
  const buyOf = (type: Awaited<ReturnType<typeof passType>>, more: Record<string, unknown>) => ({ performanceId: a.performanceId, lines: [], buy: [{ passTypeId: type.id, passPriceId: type.prices[0]!.id, ...more }] })

  it('asks who qualifies: refused with nobody named, or someone who does not qualify', async () => {
    const type = await memberType()
    expect((await summary(buyOf(type, {}))).body).toMatchObject({ code: 'box-office.pass.holder-needed' })
    const stranger = await person_('not.a.member@example.org')
    expect((await summary(buyOf(type, { accountId: stranger }))).body).toMatchObject({ code: 'box-office.pass.holder-not-met' })
  })

  it('is sold to a member found by the seller, who checks them there and then', async () => {
    const type = await memberType()
    const member = await person_('a.member@example.org')
    members.add(member)
    const checked = await inContext(() => deskHolder({ performanceId: a.performanceId, passPriceId: type.prices[0]!.id, accountId: member }), seller)
    expect(checked).toMatchObject({ accountId: member, met: true })
    const made = await sale(buyOf(type, { accountId: member }))
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body.amountMinor).toBe(2100)
  })

  it('takes their reference instead, such as a membership number, checked against the list', async () => {
    const type = await memberType()
    expect((await summary(buyOf(type, { reference: '00000000' }))).body).toMatchObject({ code: 'box-office.pass.reference-not-met' })
    const ok = await summary(buyOf(type, { reference: '12345678' }))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  })
})
