// Giving up on a payment still waiting for its answer (Box office specification, part 4): the seller
// cancels and takes the money another way; the provider is asked to stop as a best effort; money the
// provider takes after all is held in payments.unfulfilled and refunded in full, and the intent stays
// cancelled. Money taken towards a sale that then expires goes back the same way.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { attest, cancelIntent, createIntent, recordAnswer } from '../../server/services'
import { addAttempt } from '../../server/answers'
import { expireIntent } from '../../server/tasks/expire-intents'
import cancelRoute from '../../server/api/payments/intents/[id]/cancel.post'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, deliver, env, inContext, person, rows, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 19)
const MINUTE = 60_000
let card: string
let cash: string

const handle = server({ 'POST /api/payments/intents/:id/cancel': cancelRoute })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function waiting(amount: number) {
  const orderId = newId('tko')
  return commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    const { intentId } = await createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], channel: 'online', expiresAt: nowMs() + 15 * MINUTE })
    const attempt = addAttempt(view, { intentId, providerAccountId: card, method: 'card_online', amountMinor: amount })
    return { orderId, intentId, attemptId: attempt.id }
  })
}

const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]!.state
const balance = async (key: string) => (await rows<{ total: number }>('SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ?', key))[0]!.total

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'cardco']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  card = newId('ppa')
  cash = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\",\"desk\"]', 'live', 1, ?, ?)").bind(card, NOV_16, NOV_16).run()
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cash', 'Cash', '[\"desk\"]', 'live', 1, ?, ?)").bind(cash, NOV_16, NOV_16).run()
})

beforeEach(() => {
  setClock(NOV_16)
  sent.length = 0
  world.refundKeys.length = 0
  world.refundAnswer = { state: 'succeeded' }
})

describe('giving up on a payment still waiting', () => {
  it('cancels the intent, releases the sale, and names the payment still waiting', async () => {
    const { intentId, orderId, attemptId } = await waiting(1200)
    const res = await call(handle, 'POST', `/api/payments/intents/${intentId}/cancel`, { actor: person(['payments.attempt.attest']), body: {} })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cancelled: true, waiting: [attemptId] })
    expect(await state('payments_intents', intentId)).toBe('cancelled')
    expect(await state('tickets_orders', orderId)).toBe('released')
  })

  it('holds money the provider takes after all, refunds it in full, and leaves the intent cancelled', async () => {
    const { intentId, attemptId, orderId } = await waiting(1500)
    await commit(unit => cancelIntent(unit.view(), intentId))
    const held = await balance('payments.unfulfilled')
    const out = await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
    expect(out).toMatchObject({ changed: true, settled: false })
    expect(await state('payments_attempts', attemptId)).toBe('succeeded')
    expect(await state('payments_intents', intentId)).toBe('cancelled')
    expect(await state('tickets_orders', orderId)).toBe('released')
    expect(await balance('payments.unfulfilled') - held).toBe(-1500)
    const [refund] = await rows<{ id: string, amount_minor: number, state: string }>('SELECT id, amount_minor, state FROM payments_refunds WHERE attempt_id = ?', attemptId)
    expect(refund).toMatchObject({ amount_minor: 1500, state: 'approved' })
    await deliver()
    expect(await state('payments_refunds', refund!.id)).toBe('succeeded')
    expect(await balance('payments.unfulfilled') - held).toBe(0)
  })

  it('changes nothing more when the payment the seller gave up on fails', async () => {
    const { intentId, attemptId } = await waiting(700)
    await commit(unit => cancelIntent(unit.view(), intentId))
    await inContext(() => recordAnswer(attemptId, { state: 'failed', failureCode: 'declined' }, { kind: 'poll' }))
    expect(await rows('SELECT id FROM payments_refunds WHERE attempt_id = ?', attemptId)).toEqual([])
    expect(await rows('SELECT id FROM finance_postings WHERE source_id = ?', attemptId)).toEqual([])
  })
})

describe('a sale left after part was paid', () => {
  it('expires and sends back what was taken', async () => {
    const orderId = newId('tko')
    const { intentId } = await commit(async (unit) => {
      const view = unit.view()
      view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, 2000] })
      return createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: 2000 }], channel: 'desk', expiresAt: nowMs() + 15 * MINUTE })
    })
    const { attemptId } = await inContext(() => attest({ intentId, providerAccountId: cash, method: 'cash', amountMinor: 800 }), person(['payments.attempt.attest']))
    await expect(commit(unit => cancelIntent(unit.view(), intentId))).rejects.toMatchObject({ code: 'payments.intent.paid-in-part' })
    setClock(NOV_16 + 16 * MINUTE)
    await inContext(() => expireIntent(intentId))
    expect(await state('payments_intents', intentId)).toBe('expired')
    const [refund] = await rows<{ amount_minor: number, state: string }>('SELECT amount_minor, state FROM payments_refunds WHERE attempt_id = ?', attemptId)
    expect(refund).toEqual({ amount_minor: 800, state: 'approved' })
  })
})
