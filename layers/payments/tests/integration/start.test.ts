// Starting a payment with an integrated provider (startAttempt), test mode, reported fees and payouts
// entered by hand. The provider is the fixture cardco.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { collect, recordAnswer, recordPayout, retryStart, startAttempt } from '../../server/services'
import testPaymentRoute from '../../server/api/payments/providers/[id]/test-payment.post'
import payoutRoute from '../../server/api/payments/payouts.post'
import { world } from '../../../../tests/fixtures/modules/cardco/server/contributions/payments.provider/cardco'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const MINUTE = 60_000
let live: string
let test: string

const handle = server({
  'POST /api/payments/providers/:id/test-payment': testPaymentRoute,
  'POST /api/payments/payouts': payoutRoute,
})

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function order(amount: number): Promise<{ intentId: string, orderId: string }> {
  const orderId = newId('tko')
  const { intentId } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    return collect(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], expiresAt: nowMs() + 15 * MINUTE })
  })
  return { intentId, orderId }
}

async function providerAccount(mode: 'live' | 'test'): Promise<string> {
  const id = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'cardco', 'CardCo', '[\"online\"]', ?, 1, ?, ?)").bind(id, mode, NOV_16, NOV_16).run()
  return id
}

let keys = 0
const post = (path: string, actor: ReturnType<typeof person>, body: unknown) => call(handle, 'POST', path, { actor, body, headers: { 'idempotency-key': `k${++keys}` } })
const state = async (table: string, id: string) => (await rows<{ state: string }>(`SELECT state FROM ${table} WHERE id = ?`, id))[0]?.state
const postingsOf = (type: string, id: string) => rows<{ kind: string }>('SELECT kind FROM finance_postings WHERE source_type = ? AND source_id = ? ORDER BY kind', type, id)
const balance = async (key: string, scope?: string) => (await rows<{ total: number }>(
  'SELECT coalesce(sum(e.amount_minor), 0) AS total FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id WHERE a.system_key = ? AND coalesce(a.scope, \'\') = ?', key, scope ?? ''))[0]!.total

beforeAll(async () => {
  setClock(NOV_16)
  for (const id of ['finance', 'payments', 'tickets', 'cardco']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  live = await providerAccount('live')
  test = await providerAccount('test')
})

beforeEach(() => {
  setClock(NOV_16)
  world.answers.clear()
  world.startKeys.length = 0
  world.startFail = false
  world.startAnswer = undefined
})

describe('startAttempt', () => {
  it('commits the attempt, asks the provider and hands back its next step', async () => {
    const { intentId } = await order(1500)
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))
    expect(out.next).toEqual({ kind: 'redirect', url: `https://cardco.test/pay/${out.attemptId}` })
    expect(out.state).toBe('pending')
    const [attempt] = await rows<{ provider_ref: string, amount_minor: number }>('SELECT provider_ref, amount_minor FROM payments_attempts WHERE id = ?', out.attemptId)
    expect(attempt).toEqual({ provider_ref: `cc_${out.attemptId}`, amount_minor: 1500 })
  })

  it('settles at once when the provider answers that the money is taken', async () => {
    const { intentId, orderId } = await order(1200)
    world.startAnswer = { state: 'succeeded' }
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))
    expect(out.settled).toBe(true)
    expect(await state('tickets_orders', orderId)).toBe('paid')
  })

  it('refuses a second payment while one is still waiting, and more than is still to pay', async () => {
    const { intentId } = await order(1000)
    await inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))
    await expect(inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))).rejects.toMatchObject({ code: 'payments.attempt.in-flight' })
    const other = await order(1000)
    await expect(inContext(() => startAttempt(other.intentId, { providerAccountId: live, method: 'card_online', amountMinor: 1001 }))).rejects.toMatchObject({ code: 'payments.attempt.bad-amount' })
    await expect(inContext(() => startAttempt(other.intentId, { providerAccountId: live, method: 'card_online', amountMinor: 500 }))).rejects.toMatchObject({ code: 'payments.attempt.split-desk-only' })
    await expect(inContext(() => startAttempt(other.intentId, { providerAccountId: live, method: 'card_reader' }))).rejects.toMatchObject({ code: 'payments.attempt.method-unavailable' })
  })
})

describe('retry-does-not-charge-twice', () => {
  it('asks again with the same key after a start with no answer', async () => {
    const { intentId } = await order(900)
    world.startFail = true
    const first = await inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))
    expect(first.state).toBe('started')
    world.startFail = false
    const again = await inContext(() => retryStart(first.attemptId))
    expect(again.state).toBe('pending')
    expect(world.startKeys).toHaveLength(2)
    expect(new Set(world.startKeys).size).toBe(1)
    // Once answered, a retry is refused rather than asking again.
    await expect(inContext(() => retryStart(first.attemptId))).rejects.toMatchObject({ code: 'payments.attempt.already-answered' })
    expect(world.startKeys).toHaveLength(2)
  })
})

describe('test-mode-never-settles-live', () => {
  it('refuses to start a test-mode payment for a real sale', async () => {
    const { intentId } = await order(800)
    await expect(inContext(() => startAttempt(intentId, { providerAccountId: test, method: 'card_online' }))).rejects.toMatchObject({ code: 'payments.attempt.test-mode' })
    expect(await rows('SELECT id FROM payments_attempts WHERE intent_id = ?', intentId)).toHaveLength(0)
  })

  it('leaves a real sale unfulfilled, posting nothing, if test money reaches it anyway', async () => {
    const { intentId, orderId } = await order(700)
    // A test-mode attempt that got past startAttempt, as one written before the account changed mode.
    const attemptId = newId('pat')
    await env.DB.prepare("INSERT INTO payments_attempts (id, intent_id, provider_account_id, method, amount_minor, state, idempotency_key, started_at, updated_at) VALUES (?, ?, ?, 'card_online', 700, 'started', ?, ?, ?)").bind(attemptId, intentId, test, `payments:attempt:${attemptId}`, NOV_16, NOV_16).run()
    const out = await inContext(() => recordAnswer(attemptId, { state: 'succeeded', providerRef: `cc_${attemptId}` }, { kind: 'poll' }))
    expect(out).toMatchObject({ settled: false, unfulfilled: true })
    expect(await state('tickets_orders', orderId)).toBe('released')
    expect(await postingsOf('payments.intent', intentId)).toEqual([])
    expect(await rows('SELECT id FROM finance_postings WHERE source_type = \'payments.attempt\' AND source_id = ?', attemptId)).toEqual([])
  })
})

describe('test instance (payments.test-mode.takes-sales)', () => {
  const takesSales = (on: boolean) => commit(unit => changeSetting(unit.view(), 'payments.test-mode.takes-sales', on, { reason: 'test', confirm: true }))

  it('lets a test-mode account pay for a real sale, which settles and posts as live money would', async () => {
    await takesSales(true)
    try {
      const { intentId, orderId } = await order(900)
      world.startAnswer = { state: 'succeeded', feeMinor: 20 }
      const out = await inContext(() => startAttempt(intentId, { providerAccountId: test, method: 'card_online' }))
      expect(out).toMatchObject({ settled: true, unfulfilled: false })
      expect(await state('tickets_orders', orderId)).toBe('paid')
      expect(await postingsOf('payments.intent', intentId)).toEqual([{ kind: 'sale' }])
      expect(await postingsOf('payments.attempt', out.attemptId)).toEqual([{ kind: 'fee' }])
    }
    finally {
      await takesSales(false)
    }
  })

  it('still keeps Payments\' own test payment as test money that posts nothing', async () => {
    await takesSales(true)
    try {
      const admin = person(['payments.provider.manage'])
      world.startAnswer = { state: 'succeeded', feeMinor: 5 }
      const body = await (await post(`/api/payments/providers/${test}/test-payment`, admin, { method: 'card_online' })).json() as { intentId: string, attemptId: string, settled: boolean }
      expect(body.settled).toBe(true)
      expect(await postingsOf('payments.intent', body.intentId)).toEqual([])
      expect(await postingsOf('payments.attempt', body.attemptId)).toEqual([])
    }
    finally {
      await takesSales(false)
    }
  })
})

describe('setup test payment', () => {
  it('takes a test payment that Payments owns and posts nothing', async () => {
    const admin = person(['payments.provider.manage'])
    world.startAnswer = { state: 'succeeded', feeMinor: 5 }
    const res = await post(`/api/payments/providers/${test}/test-payment`, admin, { method: 'card_online' })
    expect(res.status).toBe(200)
    const body = await res.json() as { intentId: string, attemptId: string, settled: boolean }
    expect(body.settled).toBe(true)
    expect(await state('payments_intents', body.intentId)).toBe('succeeded')
    expect(await postingsOf('payments.intent', body.intentId)).toEqual([])
    expect(await postingsOf('payments.attempt', body.attemptId)).toEqual([])
  })

  it('is refused on a live account', async () => {
    const admin = person(['payments.provider.manage'])
    const res = await post(`/api/payments/providers/${live}/test-payment`, admin, { method: 'card_online' })
    expect(res.status).toBe(409)
  })
})

describe('fees', () => {
  it('posts the fee a provider reports out of the account\'s clearing', async () => {
    const { intentId } = await order(2000)
    world.startAnswer = { state: 'succeeded', feeMinor: 35 }
    const before = await balance('payments.provider-fees')
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: live, method: 'card_online' }))
    expect(out.settled).toBe(true)
    expect(await postingsOf('payments.attempt', out.attemptId)).toEqual([{ kind: 'fee' }])
    expect(await balance('payments.provider-fees') - before).toBe(35)
  })
})

describe('payouts', () => {
  it('moves a payout and its fees out of clearing once, refusing it entered again', async () => {
    const admin = person(['payments.provider.manage'])
    const clearing = await balance('payments.card-clearing', live)
    const bank = await balance('payments.bank')
    const body = { providerAccountId: live, paidMinor: 9500, feesMinor: 120, paidOn: '2026-11-15', reference: 'po_1' }
    expect((await post('/api/payments/payouts', admin, body)).status).toBe(200)
    expect((await post('/api/payments/payouts', admin, body)).status).toBe(409)
    expect(await balance('payments.card-clearing', live) - clearing).toBe(-9620)
    expect(await balance('payments.bank') - bank).toBe(9500)
    const [posting] = await rows<{ kind: string, occurred_at: number }>('SELECT kind, occurred_at FROM finance_postings WHERE idempotency_key = ?', `payments:payout:${live}:po_1`)
    expect(posting).toEqual({ kind: 'payout', occurred_at: Date.UTC(2026, 10, 15, 12) })
  })

  it('refuses a payout on a test-mode account', async () => {
    await expect(commit(unit => recordPayout(unit.view(), { providerAccountId: test, paidMinor: 1, feesMinor: 0, paidOn: '2026-11-15', reference: 'x', by: 'acc_x' }))).rejects.toMatchObject({ code: 'payments.payout.test-mode' })
  })

  it('needs the provider ability', async () => {
    const someone = person([])
    expect((await post('/api/payments/payouts', someone, { providerAccountId: live, paidMinor: 1, feesMinor: 0, paidOn: '2026-11-15', reference: 'y' })).status).toBe(403)
  })
})
