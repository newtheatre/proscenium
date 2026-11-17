// Cancelling, rescheduling or moving a performance with bookings (BO-52, BO-53; R-11): the core's
// change is refused until a decision is recorded on the Bulk cancellation screen, which shows what
// is affected; the change's event then carries the decision out, one job per booking, and every
// ticket holder is told. A decision is used once. A capacity below the seats taken is refused.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { listTerms } from '#modules/core'
import { addAttempt } from '../../../payments/server/answers'
import { recordAnswer } from '../../../payments/server/services'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { deliver, env, inContext, person, rows, setModule } from '../../../../tests/integration/helpers'
import { buy, house, NOV_16, ready, req, type House } from './stage'

const manager = person(['box-office.performance.manage'])
const programmer = person(['core.performance.cancel', 'core.performance.schedule'])
let card: string
let illness: string
let guests = 0

function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function paid(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const b = made.basket
  const started = await req('POST', `/api/box-office/baskets/${b.orderId}/checkout`, { expectedTotalMinor: b.totalMinor, email: `change${++guests}@example.org`, name: 'Changed Guest' }, null, { 'x-basket-token': b.token })
  expect(started.body.state, JSON.stringify(started.body)).toBe('awaiting_payment')
  const attemptId = await commit(async unit => addAttempt(unit.view(), { intentId: started.body.intentId, providerAccountId: card, method: 'card_online', amountMinor: b.totalMinor }).id)
  expect(await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))).toMatchObject({ settled: true })
  return b.orderId
}

async function reserved(h: House, quantity: number) {
  const made = await buy(h, quantity)
  if (!made.ok) throw new Error(made.code)
  const done = await req('POST', `/api/box-office/baskets/${made.basket.orderId}/reserve`, { expectedTotalMinor: made.basket.totalMinor, email: `change${++guests}@example.org`, name: 'Reserving Guest' }, null, { 'x-basket-token': made.basket.token })
  expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
  return made.basket.orderId
}

const state = async (orderId: string) => (await rows<{ state: string }>('SELECT state FROM box_office_orders WHERE id = ?', orderId))[0]!.state
const told = async (type: string, orderId: string) => (await rows('SELECT id FROM core_notifications WHERE type_key = ? AND subject_id = ?', type, orderId)).length
const cancel = (h: House) => req('POST', `/api/core/performances/${h.performanceId}/cancel`, { reasonTermId: illness }, programmer)
const decide = (h: House, decision: string) => req('POST', `/api/box-office/performances/${h.performanceId}/change`, { decision }, manager)

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('cardco', true)
  card = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await commit(async (unit) => {
    await changeSetting(unit.view(), 'box-office.reservations.confirm-email', false, { reason: 'test', confirm: true })
    await changeSetting(unit.view(), 'box-office.checkout.payment-timing', 'buyer-chooses', { reason: 'test', confirm: true })
  })
  world.refundAnswer = { state: 'succeeded', providerRef: 're_change' }
  illness = (await inContext(() => listTerms('core.cancel-reason'))).find(t => t.slug === 'illness')!.id
})

describe('a performance with bookings', () => {
  it('is not cancelled until a decision is recorded, and then every booking is cancelled and refunded', async () => {
    const h = await house(10)
    const bought = await paid(h, 2)
    const kept = await reserved(h, 1)

    const refused = await cancel(h)
    expect(refused.status).toBe(409)
    expect(refused.body).toMatchObject({ code: 'box-office.change.decision-needed', remedy: `/console/box-office/performances/${h.performanceId}/change?for=cancel` })
    const seen = await req('GET', `/api/box-office/performances/${h.performanceId}/change`, undefined, manager)
    expect(seen.body).toMatchObject({ bookings: 1, tickets: 2, paidMinor: 2400, reservations: 1, reservedTickets: 1, decision: null })
    expect((await req('GET', `/api/box-office/performances/${h.performanceId}/change`, undefined, person([]))).status).toBe(403)

    // Keeping the bookings is no answer to a cancellation.
    expect((await decide(h, 'keep')).status).toBe(200)
    expect((await cancel(h)).body.code).toBe('box-office.change.decision-needed')

    expect((await decide(h, 'refund_all')).status).toBe(200)
    const done = await cancel(h)
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    await deliver()
    expect(await state(bought)).toBe('cancelled')
    expect(await state(kept)).toBe('cancelled')
    expect(await rows("SELECT t.id FROM box_office_tickets t JOIN box_office_order_lines l ON l.id = t.order_line_id WHERE l.order_id = ? AND t.void_reason = 'performance_cancelled'", bought)).toHaveLength(2)
    const [refund] = await rows<{ amount_minor: number, state: string, requested_by: string | null }>('SELECT r.amount_minor, r.state, r.requested_by FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.owner_record = ?', bought)
    expect(refund).toMatchObject({ amount_minor: 2400, state: 'succeeded', requested_by: null })
    expect(await told('box-office.performance-cancelled', bought)).toBe(1)
    expect(await told('box-office.performance-cancelled', kept)).toBe(1)
    expect((await rows<{ state: string, change_decision: string | null }>('SELECT state, change_decision FROM box_office_performance_sales WHERE performance_id = ?', h.performanceId))[0]).toMatchObject({ state: 'closed', change_decision: null })
  })

  it('keeps the bookings when rescheduled, tells the ticket holders, and asks again for the next change', async () => {
    const h = await house(10)
    const bought = await paid(h, 1)
    const [p] = await rows<{ starts_at: number, ends_at: number }>('SELECT starts_at, ends_at FROM core_performances WHERE id = ?', h.performanceId)
    const later = { startsAt: p!.starts_at + 3_600_000, endsAt: p!.ends_at + 3_600_000 }
    expect((await req('PATCH', `/api/core/performances/${h.performanceId}`, later)).body.code).toBe('box-office.change.decision-needed')
    await decide(h, 'keep')
    const moved = await req('PATCH', `/api/core/performances/${h.performanceId}`, later)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    await deliver()
    expect(await state(bought)).toBe('confirmed')
    expect(await told('box-office.performance-changed', bought)).toBe(1)
    expect((await req('PATCH', `/api/core/performances/${h.performanceId}`, { startsAt: later.startsAt + 3_600_000, endsAt: later.endsAt + 3_600_000 })).body.code).toBe('box-office.change.decision-needed')
  })

  it('offers an exchange on a cancellation: paid bookings are kept and told, reservations cancelled', async () => {
    const h = await house(10)
    const bought = await paid(h, 1)
    const kept = await reserved(h, 1)
    await decide(h, 'offer_exchange')
    expect((await cancel(h)).status).toBe(200)
    await deliver()
    expect(await state(bought)).toBe('confirmed')
    expect(await told('box-office.performance-changed', bought)).toBe(1)
    expect(await state(kept)).toBe('cancelled')
  })

  it('lets a performance with no bookings change freely, but never below the seats taken', async () => {
    const empty = await house(10)
    expect((await cancel(empty)).status).toBe(200)
    const h = await house(10)
    await paid(h, 3)
    expect((await req('PATCH', `/api/core/performances/${h.performanceId}`, { capacity: 2 })).body.code).toBe('box-office.change.capacity-below-sold')
    expect((await req('PATCH', `/api/core/performances/${h.performanceId}`, { capacity: 3 })).status).toBe(200)
  })

  it('tells ticket holders when staging effects or a depicted warning are added, without naming a warning (C-57)', async () => {
    await rows("INSERT INTO core_settings (key, value, updated_at) VALUES ('core.site.origin', ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value", JSON.stringify('https://theatre.example'))
    const h = await house(10)
    const bought = await paid(h, 1)
    await rows("UPDATE core_productions SET state = 'published', published_at = 1 WHERE id = ?", h.productionId)
    const haze = (await inContext(() => listTerms('core.staging-effect'))).find(t => t.slug === 'haze')!.id
    const violence = (await inContext(() => listTerms('core.advisory'))).find(t => t.slug === 'violence')!.id
    expect((await req('PUT', `/api/core/productions/${h.productionId}/effects`, { effects: [{ termId: haze }] })).status).toBe(200)
    await deliver()
    expect(await told('box-office.guidance-added', bought)).toBe(1)
    // A mentioned warning is not told; a depicted one is, without its name.
    expect((await req('PUT', `/api/core/productions/${h.productionId}/advisories`, { advisories: [{ termId: violence, level: 'mentioned' }] })).status).toBe(200)
    await deliver()
    expect(await told('box-office.guidance-added', bought)).toBe(1)
    expect((await req('PUT', `/api/core/productions/${h.productionId}/advisories`, { advisories: [{ termId: violence, level: 'depicted' }] })).status).toBe(200)
    await deliver()
    expect(await told('box-office.guidance-added', bought)).toBe(2)
    const bodies = JSON.stringify(await rows('SELECT * FROM core_notifications WHERE type_key = ? AND subject_id = ?', 'box-office.guidance-added', bought))
    expect(bodies.toLowerCase()).not.toContain('violence')
  })
})
