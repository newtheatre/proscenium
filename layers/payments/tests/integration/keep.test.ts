// Keeping a payment being returned (Box office specification, part 4, "Keeping a payment being
// returned"): the system's refund is withdrawn, its amount stops counting as refunded, the owner books
// the income, and the money leaves payments.unfulfilled. Refused once any of it has gone back, for a
// payment that is not being returned, and when the owner's record was paid another way.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { cancelIntent, collect, recordAnswer } from '../../server/services'
import { addAttempt } from '../../server/answers'
import reconcileTask from '../../server/tasks/reconcile-attempts'
import reconcileRoute from '../../server/api/payments/attempts/[id]/reconcile.post'
import keepRoute from '../../server/api/payments/refunds/[id]/keep.post'
import listRoute from '../../server/api/payments/refunds.get'
import reasonsRoute from '../../server/api/payments/refunds/decline-reasons.get'
import attentionRoute from '../../server/api/payments/attention.get'
import attentionCount from '../../server/contributions/core.count/attention'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, deliver, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_21 = Date.UTC(2026, 10, 21, 14)
const MINUTE = 60_000
let account: string

const handle = server({
  'POST /api/payments/attempts/:id/reconcile': reconcileRoute,
  'POST /api/payments/refunds/:id/keep': keepRoute,
  'GET /api/payments/refunds': listRoute,
  'GET /api/payments/refunds/decline-reasons': reasonsRoute,
  'GET /api/payments/attention': attentionRoute,
})

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

/** A card payment the provider has not answered, for an order of `amount`. */
async function paying(amount: number): Promise<{ intentId: string, orderId: string, attemptId: string }> {
  const orderId = newId('tko')
  const { intentId, attemptId } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    const { intentId } = await collect(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], expiresAt: nowMs() + 15 * MINUTE })
    return { intentId, attemptId: addAttempt(view, { intentId, providerAccountId: account, method: 'card_online', amountMinor: amount }).id }
  })
  await inContext(() => recordAnswer(attemptId, { state: 'pending', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
  return { intentId, orderId, attemptId }
}

/** The till gave up on the payment, it went unanswered, and then it turned out to have gone through. */
async function takenAfterAll(amount: number) {
  const paid = await paying(amount)
  await commit(unit => cancelIntent(unit.view(), paid.intentId))
  setClock(NOV_21 + 4 * MINUTE)
  await inContext(() => reconcileTask(createUnit().view(), { dueAt: nowMs() }) as Promise<void>)
  expect(await state('payments_attempts', paid.attemptId)).toBe('unknown')
  return paid
}

const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]?.state
const refundsOf = (intentId: string) => rows<{ id: string, state: string, requested_by: string | null, approved_by: string | null, slug: string | null }>(
  'SELECT r.id, r.state, r.requested_by, r.approved_by, t.slug FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id LEFT JOIN core_terms t ON t.id = r.decline_reason_term_id WHERE p.intent_id = ?', intentId)
const counters = async (intentId: string) => ({
  part: (await rows<{ n: number }>('SELECT sum(refunded_minor) AS n FROM payments_intent_parts WHERE intent_id = ?', intentId))[0]!.n,
  attempt: (await rows<{ n: number }>('SELECT sum(refunded_minor) AS n FROM payments_attempts WHERE intent_id = ?', intentId))[0]!.n,
})
const entriesOf = (key: string) => rows<{ system_key: string, amount_minor: number }>(
  'SELECT a.system_key, e.amount_minor FROM finance_entries e JOIN finance_postings p ON p.id = e.posting_id JOIN finance_accounts a ON a.id = e.account_id WHERE p.idempotency_key = ? ORDER BY e.amount_minor', key)

const manager = () => person(['payments.attempt.reconcile', 'payments.refund.approve'])

beforeAll(async () => {
  setClock(NOV_21)
  for (const id of ['finance', 'payments', 'tickets', 'cardco']) await setModule(id, true)
  await inContext(() => ensureVocabularies('payments'))
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\", \"desk\"]', 'live', 1, ?, ?)").bind(account, NOV_21, NOV_21).run()
})

beforeEach(() => {
  setClock(NOV_21)
  world.answers.clear()
  world.refundAnswer = { state: 'succeeded' }
})

describe('an unanswered payment the till gave up on', () => {
  it('is shown as given up on, with what it was for', async () => {
    const { attemptId } = await takenAfterAll(1600)
    const listed = await (await call(handle, 'GET', '/api/payments/attention', { actor: manager() })).json() as { unknown: { id: string, abandoned: boolean, mayKeep: boolean, owners: { module: string }[] }[] }
    expect(listed.unknown.find(a => a.id === attemptId)).toMatchObject({ abandoned: true, mayKeep: true, owners: [{ module: 'tickets' }] })
    const reconciler = await (await call(handle, 'GET', '/api/payments/attention', { actor: person(['payments.attempt.reconcile']) })).json() as { unknown: { id: string, mayKeep: boolean }[] }
    expect(reconciler.unknown.find(a => a.id === attemptId)?.mayKeep).toBe(false)
  })

  it('is kept when the person answering says it went through and to keep it', async () => {
    const { intentId, orderId, attemptId } = await takenAfterAll(1600)
    const treasurer = manager()
    // Keeping withdraws the system's refund, so it needs someone who may approve refunds.
    const refused = await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: person(['payments.attempt.reconcile']), body: { outcome: 'succeeded', keep: true } })
    expect(refused.status).toBe(403)
    expect(await state('payments_attempts', attemptId)).toBe('unknown')
    const answered = await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: treasurer, body: { outcome: 'succeeded', keep: true } })
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ kept: true })
    expect(await refundsOf(intentId)).toEqual([expect.objectContaining({ state: 'declined', requested_by: null, approved_by: treasurer.accountId, slug: 'payment-kept' })])
    expect(await counters(intentId)).toEqual({ part: 0, attempt: 0 })
    expect(await state('tickets_orders', orderId)).toBe('kept')
    expect(await entriesOf(`payments:intent:${intentId}:kept`)).toEqual([{ system_key: 'tickets.income', amount_minor: -1600 }, { system_key: 'payments.unfulfilled', amount_minor: 1600 }])
    // The refund job queued with the hold finds nothing to send.
    await deliver()
    expect(await refundsOf(intentId)).toEqual([expect.objectContaining({ state: 'declined' })])
    const listed = await (await call(handle, 'GET', '/api/payments/attention', { actor: treasurer })).json() as { unknown: { id: string }[], unfulfilled: { id: string }[] }
    expect(listed.unknown.map(a => a.id)).not.toContain(attemptId)
    expect(listed.unfulfilled.map(i => i.id)).not.toContain(intentId)
  })

  it('refuses to keep one that did not go through', async () => {
    const { attemptId } = await takenAfterAll(500)
    const refused = await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: manager(), body: { outcome: 'failed', keep: true } })
    expect(refused.status).toBe(422)
    expect(await state('payments_attempts', attemptId)).toBe('unknown')
  })
})

describe('a payment being returned', () => {
  it('is listed with the refund to keep it from, and kept from Refunds', async () => {
    const { intentId, attemptId, orderId } = await takenAfterAll(4600)
    const treasurer = manager()
    await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: treasurer, body: { outcome: 'succeeded' } })
    const [refund] = await refundsOf(intentId)
    expect(refund).toMatchObject({ state: 'approved', requested_by: null })
    expect(await counters(intentId)).toEqual({ part: 4600, attempt: 4600 })
    expect(await inContext(() => attentionCount.value(treasurer))).toBeGreaterThan(0)
    const listed = await (await call(handle, 'GET', '/api/payments/attention', { actor: treasurer })).json() as { unfulfilled: { id: string, keepRefundId: string | null }[] }
    expect(listed.unfulfilled.find(i => i.id === intentId)?.keepRefundId).toBe(refund!.id)

    expect((await call(handle, 'POST', `/api/payments/refunds/${refund!.id}/keep`, { actor: person(['payments.attempt.reconcile']), body: {} })).status).toBe(403)
    const kept = await call(handle, 'POST', `/api/payments/refunds/${refund!.id}/keep`, { actor: treasurer, body: {} })
    expect(kept.status).toBe(200)
    expect(await kept.json()).toMatchObject({ intentId, keptMinor: 4600, withdrawn: [refund!.id] })
    expect(await state('tickets_orders', orderId)).toBe('kept')
    expect(await counters(intentId)).toEqual({ part: 0, attempt: 0 })
    const rowsListed = await (await call(handle, 'GET', '/api/payments/refunds?view=all', { actor: treasurer })).json() as { rows: { id: string, kept: boolean, approvedByName: string | null }[] }
    expect(rowsListed.rows.find(r => r.id === refund!.id)).toMatchObject({ kept: true })

    // Kept once: a second try finds nothing being returned.
    const again = await call(handle, 'POST', `/api/payments/refunds/${refund!.id}/keep`, { actor: treasurer, body: {} })
    expect(again.status).toBe(409)
    expect(await again.json()).toMatchObject({ code: 'payments.keep.not-held' })
  })

  it('is refused once its refund has gone back', async () => {
    const { intentId, attemptId } = await takenAfterAll(800)
    await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: manager(), body: { outcome: 'succeeded' } })
    await deliver()
    const [refund] = await refundsOf(intentId)
    expect(refund!.state).toBe('succeeded')
    const refused = await call(handle, 'POST', `/api/payments/refunds/${refund!.id}/keep`, { actor: manager(), body: {} })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'payments.keep.returned' })
  })

  it('is refused, changing nothing, when the order was paid another way since', async () => {
    const { intentId, attemptId, orderId } = await takenAfterAll(900)
    await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: manager(), body: { outcome: 'succeeded' } })
    await env.DB.prepare("UPDATE tickets_orders SET state = 'paid' WHERE id = ?").bind(orderId).run()
    const [refund] = await refundsOf(intentId)
    const refused = await call(handle, 'POST', `/api/payments/refunds/${refund!.id}/keep`, { actor: manager(), body: {} })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: 'tickets.order.paid' })
    expect(await refundsOf(intentId)).toEqual([expect.objectContaining({ state: 'approved', approved_by: null })])
    expect(await counters(intentId)).toEqual({ part: 900, attempt: 900 })
    expect(await entriesOf(`payments:intent:${intentId}:kept`)).toEqual([])
  })
})

describe('the reasons for declining a refund', () => {
  it('leave out the one the system gives a kept payment', async () => {
    const listed = await (await call(handle, 'GET', '/api/payments/refunds/decline-reasons', { actor: manager() })).json() as { reasons: { label: string }[] }
    expect(listed.reasons.length).toBeGreaterThan(0)
    expect(listed.reasons.map(r => r.label)).not.toContain('Payment kept: they had what they paid for')
  })
})
