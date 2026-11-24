// Box office's figures for Reports (REP-02): tickets counted from Box office's tables and money from
// its own ledger accounts, by performance and the other keys, and totals that match the production
// statement to the penny.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms, readMeasure } from '#modules/core'
import { productionStatement } from '../../../finance/server/reports'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { deliver, env, inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const reader = person(['box-office.report.view'])
const manager = person(['box-office.order.cancel', 'box-office.order.refund'])
const period = { from: '2026-11-01', to: '2026-11-30' }
let card: string
let guests = 0
let h: House
let day: string

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

/** An order of full-price tickets paid online by card. */
async function paid(target: House, quantity: number): Promise<string> {
  const made = await buy(target, quantity)
  if (!made.ok) throw new Error(made.code)
  const b = made.basket
  const started = await req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: b.totalMinor, email: `figures${++guests}@example.org`, name: 'Paying Guest' }, null, { 'x-basket-token': b.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await commit(async unit => addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: b.totalMinor }).id)
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
  return b.orderId
}

const read = (id: string, query: Partial<Parameters<typeof readMeasure>[1]> = {}) =>
  inContext(() => readMeasure(`box-office.${id}`, { ...period, by: [], scope: { production: h.productionId }, ...query }, reader), reader)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await commit(unit => changeSetting(unit.view(), 'payments.refunds.self-approve-up-to', 5000, { reason: 'test', confirm: true }))
  world.refundAnswer = { state: 'succeeded', providerRef: 're_figures' }

  h = await house(10, { startsAt: Date.UTC(2026, 10, 20, 19, 30) })
  day = (await rows<{ operating_day: string }>('SELECT operating_day FROM core_performances WHERE id = ?', h.performanceId))[0]!.operating_day
  const kept = await paid(h, 3)
  const refunded = await paid(h, 1)
  const reason = (await inContext(() => listTerms('box-office.cancellation-reason'))).find(t => t.slug === 'cannot-attend')!.id
  const cancelled = await req('POST', `/api/box-office/orders/${refunded}/cancel`, { reasonTermId: reason, refund: 'full' }, manager)
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
  await deliver()

  // One of the kept tickets is complimentary and one has been scanned in.
  const comp = newId('tty')
  await env.DB.prepare("INSERT INTO box_office_ticket_types (id, name, kind, created_at, updated_at) VALUES (?, 'Figures comp', 'complimentary', 0, 0)").bind(comp).run()
  const lines = await rows<{ id: string }>("SELECT id FROM box_office_order_lines WHERE order_id = ? AND kind = 'ticket' ORDER BY id", kept)
  await env.DB.prepare('UPDATE box_office_order_lines SET ticket_type_id = ? WHERE id = ?').bind(comp, lines[0]!.id).run()
  await env.DB.prepare("UPDATE box_office_tickets SET admitted_at = ? WHERE order_line_id = ? AND state = 'valid'").bind(NOV_16, lines[1]!.id).run()
})

describe('Box office\'s ticket figures', () => {
  it('counts valid tickets issued, sold, complimentary and admitted for a production', async () => {
    expect(await read('tickets-issued')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 3 }] })
    expect(await read('tickets-sold')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 2 }] })
    expect(await read('tickets-comp')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 1 }] })
    expect(await read('admitted')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 1 }] })
  })
  it('breaks down by performance, day, channel and ticket type, and narrows by a declared filter', async () => {
    expect(await read('tickets-sold', { by: ['performance', 'day'] })).toEqual({ state: 'ok', rows: [{ keys: { performance: h.performanceId, day }, value: 2 }] })
    expect(await read('tickets-issued', { by: ['box-office.channel'] })).toEqual({ state: 'ok', rows: [{ keys: { 'box-office.channel': 'online' }, value: 3 }] })
    expect(await read('tickets-sold', { by: ['box-office.ticket-type'], filter: { key: 'box-office.ticket-type', values: [h.fullId] } })).toEqual({ state: 'ok', rows: [{ keys: { 'box-office.ticket-type': h.fullId }, value: 2 }] })
  })
  it('counts orders and bookers once each, and capacity and how much of it is filled', async () => {
    expect(await read('orders')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 1 }] })
    expect(await read('bookers')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 1 }] })
    expect(await read('capacity')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 10 }] })
    expect(await read('capacity-filled', { by: ['performance'] })).toMatchObject({ state: 'ok', rows: [{ keys: { performance: h.performanceId }, value: 30 }] })
  })
  it('finds nothing outside the period or for another production', async () => {
    expect(await read('tickets-issued', { from: '2026-12-01', to: '2026-12-31' })).toEqual({ state: 'ok', rows: [{ keys: {}, value: 0 }] })
    expect(await read('tickets-issued', { scope: { production: newId('prd') } })).toEqual({ state: 'ok', rows: [{ keys: {}, value: 0 }] })
  })
})

describe('Box office\'s money figures', () => {
  it('reads gross, refunds, net and net of VAT from its own accounts', async () => {
    expect(await read('gross')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 4800, currency: 'GBP' }] })
    expect(await read('refunds')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 1200, currency: 'GBP' }] })
    expect(await read('net')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 3600, currency: 'GBP' }] })
    expect(await read('net-of-vat')).toEqual({ state: 'ok', rows: [{ keys: {}, value: 3600, currency: 'GBP' }] })
    expect(await read('net', { by: ['performance'] })).toEqual({ state: 'ok', rows: [{ keys: { performance: h.performanceId }, value: 3600, currency: 'GBP' }] })
  })
  it('matches the production statement to the penny', async () => {
    const statement = await inContext(() => productionStatement(h.productionId))
    const sum = (field: 'salesMinor' | 'refundsMinor' | 'netMinor') => statement.lines.reduce((total, line) => total + line[field], 0)
    expect((await read('gross')) as { rows: { value: number }[] }).toMatchObject({ rows: [{ value: sum('salesMinor') }] })
    expect((await read('refunds')) as { rows: { value: number }[] }).toMatchObject({ rows: [{ value: -sum('refundsMinor') }] })
    expect((await read('net')) as { rows: { value: number }[] }).toMatchObject({ rows: [{ value: sum('netMinor') }] })
  })
  it('needs box-office.report.view, on the production or site-wide', async () => {
    const nobody = person([])
    expect(await inContext(() => readMeasure('box-office.gross', { ...period, by: [], scope: { production: h.productionId } }, nobody), nobody).catch(e => e.code)).toBe('core.access.denied')
  })
})
