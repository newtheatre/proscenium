// PAY-05 (gate) and PAY-04: Payments is not fooled by a repeated or forged webhook, events out of
// order end in the state the provider reports, an attempt with no answer becomes unknown rather than
// failed, and a person can answer it from the provider's records. The provider is the fixture cardco.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { collect, recordAnswer } from '../../server/services'
import { addAttempt } from '../../server/answers'
import reconcileTask from '../../server/tasks/reconcile-attempts'
import pruneTask from '../../server/tasks/prune-webhooks'
import webhookRoute from '../../server/api/payments/webhooks/[account].post'
import reconcileRoute from '../../server/api/payments/attempts/[id]/reconcile.post'
import attentionRoute from '../../server/api/payments/attention.get'
import unknownAttempts from '../../server/contributions/core.health-check/unknown-attempts'
import { sign, world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, deliver, env, inContext, person, rows, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const MINUTE = 60_000
let account: string

const handle = server({
  'POST /api/payments/webhooks/:account': webhookRoute,
  'POST /api/payments/attempts/:id/reconcile': reconcileRoute,
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

/** An online order for `amount`, with a card attempt the provider has said is pending. */
async function paying(amount: number): Promise<{ intentId: string, orderId: string, attemptId: string, ref: string }> {
  const orderId = newId('tko')
  const { intentId, attemptId } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    const { intentId } = await collect(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], expiresAt: nowMs() + 15 * MINUTE })
    const attempt = addAttempt(view, { intentId, providerAccountId: account, method: 'card_online', amountMinor: amount })
    return { intentId, attemptId: attempt.id }
  })
  const ref = `cc_${attemptId}`
  await inContext(() => recordAnswer(attemptId, { state: 'pending', providerRef: ref }, { kind: 'poll' }))
  return { intentId, orderId, attemptId, ref }
}

function webhook(event: { id: string, type: string, ref?: string }, signature = sign(event.id)) {
  return call(handle, 'POST', `/api/payments/webhooks/${account}`, { body: event, headers: { 'x-cardco-signature': signature } })
}

const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]?.state
const postings = (intentId: string) => rows<{ kind: string }>("SELECT kind FROM finance_postings WHERE source_type = 'payments.intent' AND source_id = ?", intentId)
const reconcile = () => inContext(() => reconcileTask(createUnit().view(), { dueAt: nowMs() }) as Promise<void>)

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'cardco']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', 'live', 1, ?, ?)").bind(account, NOV_16, NOV_16).run()
})

beforeEach(() => {
  setClock(NOV_16)
  world.answers.clear()
  world.failStatus = false
  sent.length = 0
})

describe('webhook-twice-changes-nothing', () => {
  it('stores a repeated delivery once and settles once', async () => {
    const { intentId, orderId, ref } = await paying(1500)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    const event = { id: 'evt_1', type: 'payment.succeeded', ref }
    expect((await webhook(event)).status).toBe(200)
    expect((await webhook(event)).status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM payments_webhook_events WHERE provider_event_id = ?', 'evt_1')).toEqual([{ n: 1 }])
    expect(await deliver()).toEqual(['done'])
    expect(await state('payments_intents', intentId)).toBe('succeeded')
    expect(await state('tickets_orders', orderId)).toBe('paid')
    expect(await postings(intentId)).toEqual([{ kind: 'sale' }])
  })

  it('settles once when two different events report the same success', async () => {
    const { intentId, attemptId, ref } = await paying(900)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    await webhook({ id: 'evt_2a', type: 'charge.succeeded', ref })
    await webhook({ id: 'evt_2b', type: 'payment.succeeded', ref })
    expect(await deliver()).toEqual(['done', 'done'])
    expect(await postings(intentId)).toEqual([{ kind: 'sale' }])
    expect(await rows("SELECT kind, source FROM payments_attempt_events WHERE attempt_id = ? AND kind = 'provider_succeeded'", attemptId)).toHaveLength(1)
    expect(await rows('SELECT count(*) AS n FROM payments_webhook_events WHERE attempt_id = ? AND handled_at IS NOT NULL', attemptId)).toEqual([{ n: 2 }])
  })
})

describe('webhook-out-of-order', () => {
  it('ends paid when "failed" arrives before "succeeded", because the provider is asked', async () => {
    const { intentId, attemptId, ref } = await paying(700)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    await webhook({ id: 'evt_3a', type: 'payment.failed', ref })
    await webhook({ id: 'evt_3b', type: 'payment.succeeded', ref })
    await deliver()
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
    expect(await state('payments_intents', intentId)).toBe('succeeded')
  })

  it('stays paid when "failed" arrives after "succeeded"', async () => {
    const { intentId, attemptId, ref } = await paying(700)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    await webhook({ id: 'evt_4a', type: 'payment.succeeded', ref })
    await deliver()
    world.answers.set(ref, { state: 'failed', providerRef: ref, failureCode: 'declined' })
    await webhook({ id: 'evt_4b', type: 'payment.failed', ref })
    expect(await deliver()).toEqual(['done'])
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
    expect(await postings(intentId)).toEqual([{ kind: 'sale' }])
  })

  it('asks again later when the provider has no answer yet', async () => {
    const { attemptId, ref } = await paying(400)
    await webhook({ id: 'evt_5', type: 'payment.updated', ref })
    const [outcome] = await deliver()
    expect(outcome).not.toBe('done')
    expect(await state('payments_attempts', attemptId)).toBe('pending')
    expect(await rows("SELECT handled_at FROM payments_webhook_events WHERE provider_event_id = 'evt_5'")).toEqual([{ handled_at: null }])
  })
})

describe('forged-webhook-ignored', () => {
  it('stores an event with a bad signature as unverified and acts on nothing', async () => {
    const { attemptId, ref } = await paying(1200)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    const forged = await webhook({ id: 'evt_6', type: 'payment.succeeded', ref }, 'not-the-signature')
    expect(forged.status).toBe(400)
    expect(await rows("SELECT signature_ok, attempt_id, handled_at FROM payments_webhook_events WHERE provider_event_id = 'evt_6'")).toEqual([{ signature_ok: 0, attempt_id: null, handled_at: null }])
    expect(sent).toHaveLength(0)
    expect(await state('payments_attempts', attemptId)).toBe('pending')
    // The forgery named a real event id: the genuine delivery is still taken.
    expect((await webhook({ id: 'evt_6', type: 'payment.succeeded', ref })).status).toBe(200)
    await deliver()
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
  })

  it('refuses a body it cannot read, and an account that takes no webhooks', async () => {
    expect((await call(handle, 'POST', `/api/payments/webhooks/${account}`, { body: { nothing: true } })).status).toBe(400)
    expect((await call(handle, 'POST', '/api/payments/webhooks/ppa_nobody', { body: { id: 'x', type: 'y' } })).status).toBe(404)
  })
})

describe('no-answer-is-unknown-not-failed', () => {
  it('marks a pending attempt unknown after the time allowed, keeps the order held, and settles on a later answer', async () => {
    const { intentId, orderId, attemptId, ref } = await paying(2000)
    await reconcile()
    expect(await state('payments_attempts', attemptId)).toBe('pending')
    setClock(NOV_16 + 4 * MINUTE)
    await reconcile()
    expect(await state('payments_attempts', attemptId)).toBe('unknown')
    expect(await state('tickets_orders', orderId)).toBe('held')
    expect(await rows("SELECT payload FROM core_events WHERE name = 'payments.attempt.unknown' AND payload LIKE ?", `%${attemptId}%`)).toHaveLength(1)
    // An unknown attempt is never expired with its intent.
    setClock(NOV_16 + 60 * MINUTE)
    world.answers.set(ref, { state: 'succeeded', providerRef: ref })
    await reconcile()
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
    expect(await state('payments_intents', intentId)).toBe('succeeded')
    expect(await state('tickets_orders', orderId)).toBe('paid')
  })

  it('treats a provider that is down as no answer, and a provider that stopped an unknown payment as not paid', async () => {
    const { attemptId, ref } = await paying(300)
    world.failStatus = true
    setClock(NOV_16 + 4 * MINUTE)
    await reconcile()
    expect(await state('payments_attempts', attemptId)).toBe('unknown')
    world.failStatus = false
    world.answers.set(ref, { state: 'cancelled', providerRef: ref })
    await reconcile()
    expect(await rows('SELECT state, failure_code FROM payments_attempts WHERE id = ?', attemptId)).toEqual([{ state: 'failed', failure_code: 'cancelled' }])
  })
})

describe('a person answers an unknown attempt (PAY-04)', () => {
  it('lists it under Needs attention with how long it has waited, and records the answer under their name', async () => {
    const { intentId, attemptId } = await paying(1100)
    setClock(NOV_16 + 4 * MINUTE)
    await reconcile()
    setClock(NOV_16 + 90 * MINUTE)
    const treasurer = person(['payments.attempt.reconcile'])
    const listed = await (await call(handle, 'GET', '/api/payments/attention', { actor: treasurer })).json() as { unknown: { id: string, waitingMs: number }[] }
    expect(listed.unknown.find(a => a.id === attemptId)?.waitingMs).toBe(90 * MINUTE)
    const health = await inContext(() => unknownAttempts.check())
    expect(health.state).toBe('warning')

    expect((await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: person([]), body: { outcome: 'succeeded' } })).status).toBe(403)
    const answered = await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: treasurer, body: { outcome: 'succeeded', providerRef: 'cc_dashboard_1' } })
    expect(answered.status).toBe(200)
    expect(await state('payments_intents', intentId)).toBe('succeeded')
    expect(await rows('SELECT answered_by, provider_ref FROM payments_attempts WHERE id = ?', attemptId)).toEqual([{ answered_by: treasurer.accountId, provider_ref: `cc_${attemptId}` }])
    expect(await rows("SELECT kind, source, by FROM payments_attempt_events WHERE attempt_id = ? AND kind = 'reconciled'", attemptId)).toEqual([{ kind: 'reconciled', source: 'person', by: treasurer.accountId }])
    const again = await call(handle, 'POST', `/api/payments/attempts/${attemptId}/reconcile`, { actor: treasurer, body: { outcome: 'failed' } })
    expect(again.status).toBe(409)
  })
})

describe('webhook receipts', () => {
  it('are deleted once older than the retention setting', async () => {
    await env.DB.prepare("INSERT INTO payments_webhook_events (id, provider_account_id, provider_event_id, type, signature_ok, received_at) VALUES (?, ?, 'evt_old', 'x', 1, ?)").bind(newId('pwe'), account, NOV_16 - 100 * 24 * 60 * MINUTE).run()
    await commit(unit => pruneTask(unit.view(), { dueAt: nowMs() }) as Promise<void>)
    expect(await rows("SELECT id FROM payments_webhook_events WHERE provider_event_id = 'evt_old'")).toEqual([])
  })
})
