// VAT on ticket money (BO-78): a ticket type's tax code, or the theatre's usual one, is split out of
// each price when the payment posts; a refund takes it back, and what Box office moves itself (a fee
// kept) moves without it, so deferred income for a performance comes back to nothing.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, openSpecial, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { ensureSystemAccounts } from '../../../finance/server/ledger'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { deliver, env, inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { updateTicketType } from '../../server/ticket-types'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const total = async (key: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total

const boxOfficeManager = person(['box-office.order.cancel', 'box-office.order.refund'])
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
  const told = JSON.parse(row!.payload) as { link?: string }
  const sealed = JSON.parse((await inContext(() => openSpecial(row!.sealed_variables)))!) as { link?: string }
  const link = (told.link ?? sealed.link)!
  const token = link.slice(link.lastIndexOf('/') + 1)
  // The codes are on the page the message links to.
  const page = await req('GET', '/api/box-office/orders/link', undefined, null, { 'x-order-token': token })
  const codes = page.body.tickets.map((t: { doorCode: string }) => t.doorCode) as string[]
  return { orderId: b.orderId, lines: await lineIds(b.orderId), codes, token }
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
  await commit(unit => ensureSystemAccounts(unit.view(), 'finance'))
  await set('finance.tax.number', 'GB123456789')
  await set('finance.tax.registered', true)
})

describe('VAT on ticket money', () => {
  it('splits the usual code\'s VAT out of each ticket as the payment posts', async () => {
    const h = await house(5)
    const vat = await total('finance.vat-output')
    const o = await paid(h, 3)
    // Three tickets at 1200, VAT included at 20%: 3000 owed to the audience, 600 owed to HMRC.
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-3000)
    expect(await total('finance.vat-output') - vat).toBe(-600)
    const [line] = await rows<{ tax_code: string, tax_minor: number }>(
      "SELECT e.tax_code, e.tax_minor FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = 'box-office.deferred-ticket-income' AND e.performance_id = ?", h.performanceId)
    expect(line).toEqual({ tax_code: 'standard', tax_minor: -600 })

    // One cancelled with the fee kept: 1050 back with its VAT, and the 150 fee moves off deferred without it.
    await set('box-office.cancellations.fee', 150)
    const done = await cancel(o.orderId, { lineIds: o.lines.slice(0, 1), refund: 'less-fee' })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    await deliver()
    expect(await total('finance.vat-output') - vat).toBe(-600 + 175)
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-2000)
    expect(await balance('box-office.booking-fee-income', h.performanceId)).toBe(-125)
    await set('box-office.cancellations.fee', 0)
  })

  it('takes a ticket type\'s own code', async () => {
    const h = await house(5)
    await commit(unit => updateTicketType(unit.view(), h.fullId, { taxCode: 'exempt' }))
    await expect(commit(unit => updateTicketType(unit.view(), h.fullId, { taxCode: 'luxury' }))).rejects.toMatchObject({ code: 'box-office.ticket-type.tax-code' })
    const vat = await total('finance.vat-output')
    await paid(h, 2)
    expect(await total('finance.vat-output')).toBe(vat)
    expect(await balance('box-office.deferred-ticket-income', h.performanceId)).toBe(-2400)
    await commit(unit => updateTicketType(unit.view(), h.fullId, { taxCode: null }))
  })
})
