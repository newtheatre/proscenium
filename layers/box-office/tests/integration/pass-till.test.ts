// Passes at the till (BO-64; Matt, 18 November): a pass scanned or typed in the find box gives one
// entry tonight, booked at once when there is nothing to pay; beside paid tickets, or with what an
// unpaid pass still owes, it goes through the till's payment. A new pass is sold at the till with its
// first entry tonight, or on its own, to the holder the seller picks; and a pass's money still owed
// is paid on its own.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { attest, openSession } from '../../../payments/server/services'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { issuePass } from '../../server/pass-holding'
import { listPassTypes } from '../../server/passes'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, req, type House } from './stage'

const seller = person(['payments.session.open', 'payments.attempt.attest', 'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.pass.manage'])
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
const payCash = (intentId: string) => inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash' }), seller)
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
  await commit(async (unit) => {
    await changeSetting(unit.view(), 'payments.cash.enabled', true, { reason: 'test', confirm: true }) // these take cash
  })
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
