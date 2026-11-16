// The SumUp reader provider against a pretend SumUp: pairing, a checkout on a reader, the webhook
// token, finding the transaction by the attempt's id (so a retry and a refund never act twice),
// cancelling at the reader, and a checkout the reader never started.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { cancelAttempt, createIntent, requestRefund, retryStart, startAttempt } from '../../server/services'
import { transport } from '../../server/calls/sumup/client'
import { webhookToken } from '../../server/contributions/payments.provider/sumup'
import pairRoute from '../../server/api/payments/providers/[id]/readers.post'
import webhookRoute from '../../server/api/payments/webhooks/[account].post'
import { call, deliver, env, inContext, person, rows, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 19)
const MINUTE = 60_000
let account: string

interface Seen { method: string, path: string, query: URLSearchParams, body: any }
const seen: Seen[] = []
const transactions = new Map<string, { id: string, status: string, amount: number, currency: string, fee_amount?: number, events?: { type: string, status: string, amount: number }[] }>()
let checkoutReply: 'ok' | 'offline' | 'network' = 'ok'

const real = transport.fetch
async function fakeSumUp(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url)
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  seen.push({ method: init.method!, path: parsed.pathname, query: parsed.searchParams, body })
  const json = (status: number, value?: unknown) => new Response(value === undefined ? null : JSON.stringify(value), { status })
  const path = parsed.pathname
  if (init.method === 'POST' && /^\/v0\.1\/merchants\/MC123\/readers$/.test(path)) return json(201, { id: `rdr_sumup_${body.pairing_code}`, status: 'paired' })
  if (init.method === 'POST' && path.endsWith('/checkout')) {
    if (checkoutReply === 'network') throw new Error('connection reset')
    if (checkoutReply === 'offline') return json(422, { errors: { type: 'ReaderOffline', detail: 'The reader is offline' } })
    return json(201, { data: { checkout_id: 'chk', client_transaction_id: `ctx_${body.affiliate.foreign_transaction_id}` } })
  }
  if (init.method === 'POST' && path.endsWith('/terminate')) return json(202)
  if (init.method === 'GET' && path === '/v2.1/merchants/MC123/transactions') {
    const tx = transactions.get(parsed.searchParams.get('foreign_transaction_id') ?? '')
    return tx ? json(200, tx) : json(404, { message: 'Resource not found', error_code: 'NOT_FOUND' })
  }
  if (init.method === 'POST' && /\/payments\/[^/]+\/refunds$/.test(path)) return json(201, {})
  return json(404, { error_code: 'NOT_FOUND' })
}

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function reader(): Promise<string> {
  const id = newId('rdr')
  await env.DB.prepare('INSERT INTO payments_readers (id, provider_account_id, label, external_ref, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(id, account, 'Foyer', `ext_${id}`, NOV_16, NOV_16).run()
  return id
}

async function sale(amount: number): Promise<{ intentId: string, orderId: string, partId: string }> {
  const orderId = newId('tko')
  const { intentId, partIds } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    return createIntent(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], channel: 'desk', expiresAt: nowMs() + 30 * MINUTE })
  })
  return { intentId, orderId, partId: partIds[0]! }
}

const handle = server({ 'POST /api/payments/providers/:id/readers': pairRoute, 'POST /api/payments/webhooks/:account': webhookRoute })
const secrets = env as unknown as Record<string, string | undefined>
const attemptRow = async (id: string) => (await rows<{ state: string, provider_ref: string | null, failure_code: string | null }>('SELECT state, provider_ref, failure_code FROM payments_attempts WHERE id = ?', id))[0]!

beforeAll(async () => {
  setClock(NOV_16)
  transport.fetch = fakeSumUp
  for (const id of ['finance', 'payments', 'tickets']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, external_ref, active, created_at, updated_at) VALUES (?, 'sumup', 'SumUp', '[\"desk\"]', 'live', 'MC123', 1, ?, ?)").bind(account, NOV_16, NOV_16).run()
})

afterAll(() => {
  transport.fetch = real
  delete secrets.PAYMENTS_SUMUP_API_KEY
  delete secrets.PAYMENTS_SUMUP_AFFILIATE_KEY
  delete secrets.PAYMENTS_SUMUP_APP_ID
})

beforeEach(() => {
  setClock(NOV_16)
  secrets.PAYMENTS_SUMUP_API_KEY = 'sup_sk_test'
  secrets.PAYMENTS_SUMUP_AFFILIATE_KEY = 'sup_afk_test'
  secrets.PAYMENTS_SUMUP_APP_ID = 'com.example.theatre'
  seen.length = 0
  sent.length = 0
  transactions.clear()
  checkoutReply = 'ok'
})

async function onReader(amount: number, origin?: string) {
  const readerId = await reader()
  const placed = await sale(amount)
  const out = await inContext(() => startAttempt(placed.intentId, { providerAccountId: account, method: 'card_reader', readerId, origin }))
  return { ...placed, readerId, out }
}

describe('pairing', () => {
  it('pairs a reader from its code and records SumUp\'s id for it', async () => {
    const res = await call(handle, 'POST', `/api/payments/providers/${account}/readers`, { actor: person(['payments.provider.manage']), body: { pairingCode: 'ABCD1234', label: 'Bar reader' }, headers: { 'idempotency-key': 'pair-1' } })
    expect(res.status).toBe(200)
    const { readerId } = await res.json() as { readerId: string }
    expect(seen[0]!.body).toEqual({ pairing_code: 'ABCD1234', name: 'Bar reader' })
    expect((await rows('SELECT label, external_ref FROM payments_readers WHERE id = ?', readerId))[0]).toEqual({ label: 'Bar reader', external_ref: 'rdr_sumup_ABCD1234' })
  })
})

describe('a checkout on the reader', () => {
  it('sends the amount in minor units with the attempt\'s id, and waits for the reader', async () => {
    const { out } = await onReader(1250, 'https://theatre.example')
    const checkout = seen.find(r => r.path.endsWith('/checkout'))!
    expect(checkout.body.total_amount).toEqual({ value: 1250, currency: 'GBP', minor_unit: 2 })
    expect(checkout.body.affiliate).toEqual({ app_id: 'com.example.theatre', key: 'sup_afk_test', foreign_transaction_id: out.attemptId })
    const token = await inContext(() => webhookToken(account))
    expect(checkout.body.return_url).toBe(`https://theatre.example/api/payments/webhooks/${account}?token=${token}`)
    expect(out.next).toEqual({ kind: 'waiting-for-reader' })
    expect(await attemptRow(out.attemptId)).toMatchObject({ state: 'pending', provider_ref: `ctx_${out.attemptId}` })
  })

  it('fails at once when SumUp says the reader is offline', async () => {
    checkoutReply = 'offline'
    const { out } = await onReader(800)
    expect(await attemptRow(out.attemptId)).toMatchObject({ state: 'failed', failure_code: 'ReaderOffline' })
  })

  it('settles from the transaction, with its fee, after a webhook carrying the token', async () => {
    const { out, orderId, intentId } = await onReader(2000, 'https://theatre.example')
    transactions.set(out.attemptId, { id: 'tx_1', status: 'SUCCESSFUL', amount: 20, currency: 'GBP', fee_amount: 0.35 })
    const token = await inContext(() => webhookToken(account))
    const event = { id: 'wh_1', event_type: 'solo.transaction.updated', payload: { client_transaction_id: `ctx_${out.attemptId}`, merchant_code: 'MC123', status: 'successful' }, timestamp: '2026-11-16T19:00:00Z' }
    expect((await call(handle, 'POST', `/api/payments/webhooks/${account}?token=wrong`, { body: event })).status).toBe(400)
    expect((await call(handle, 'POST', `/api/payments/webhooks/${account}?token=${token}`, { body: { ...event, id: 'wh_2' } })).status).toBe(200)
    expect(await deliver()).toEqual(['done'])
    expect((await rows<{ state: string }>('SELECT state FROM tickets_orders WHERE id = ?', orderId))[0]!.state).toBe('paid')
    expect(await rows('SELECT kind FROM finance_postings WHERE source_id IN (?, ?) ORDER BY kind', intentId, out.attemptId)).toEqual([{ kind: 'fee' }, { kind: 'sale' }])
  })
})

describe('retry-does-not-charge-twice', () => {
  it('finds the transaction a lost start made and does not send the reader a second checkout', async () => {
    checkoutReply = 'network'
    const { out } = await onReader(1500)
    expect(await attemptRow(out.attemptId)).toMatchObject({ state: 'started' })
    // The reader did get it, and the customer is paying.
    transactions.set(out.attemptId, { id: 'tx_2', status: 'PENDING', amount: 15, currency: 'GBP' })
    checkoutReply = 'ok'
    seen.length = 0
    const again = await inContext(() => retryStart(out.attemptId))
    expect(again.state).toBe('pending')
    expect(seen.filter(r => r.path.endsWith('/checkout'))).toHaveLength(0)
  })
})

describe('cancelling at the reader', () => {
  it('stays waiting until SumUp says the payment stopped, and the reader\'s answer wins', async () => {
    const { out } = await onReader(900)
    expect(await inContext(() => cancelAttempt(out.attemptId))).toEqual({ state: 'pending' })
    expect(seen.some(r => r.path.endsWith('/terminate'))).toBe(true)
    transactions.set(out.attemptId, { id: 'tx_3', status: 'SUCCESSFUL', amount: 9, currency: 'GBP' })
    expect(await inContext(() => cancelAttempt(out.attemptId))).toEqual({ state: 'succeeded' })
  })

  it('a checkout the reader never started fails once SumUp\'s window has long passed', async () => {
    const { out } = await onReader(700)
    setClock(NOV_16 + 11 * MINUTE)
    expect(await inContext(() => cancelAttempt(out.attemptId))).toEqual({ state: 'failed' })
    expect(await attemptRow(out.attemptId)).toMatchObject({ failure_code: 'not-started' })
  })
})

describe('refunds', () => {
  it('refunds in major units against SumUp\'s transaction, and never twice', async () => {
    const { out, partId } = await onReader(3000)
    transactions.set(out.attemptId, { id: 'tx_4', status: 'SUCCESSFUL', amount: 30, currency: 'GBP', events: [] })
    await inContext(() => retryStart(out.attemptId).catch(() => null))
    await inContext(() => cancelAttempt(out.attemptId).catch(() => null))
    expect(await attemptRow(out.attemptId)).toMatchObject({ state: 'succeeded' })

    const first = await commit(unit => requestRefund(unit.view(), { partId, amountMinor: 1500, requestedBy: null }))
    seen.length = 0
    await deliver()
    const sentRefund = seen.find(r => r.path.endsWith('/refunds'))!
    expect(sentRefund.path).toBe('/v1.0/merchants/MC123/payments/tx_4/refunds')
    expect(sentRefund.body).toEqual({ amount: 15 })
    expect((await rows<{ state: string }>('SELECT state FROM payments_refunds WHERE id = ?', first.refundId))[0]!.state).toBe('succeeded')

    // The second refund's first try reached SumUp, but its answer was lost: SumUp shows both.
    transactions.get(out.attemptId)!.events = [{ type: 'REFUND', status: 'SUCCESSFUL', amount: 15 }, { type: 'REFUND', status: 'SUCCESSFUL', amount: 10 }]
    const second = await commit(unit => requestRefund(unit.view(), { partId, amountMinor: 1000, requestedBy: null }))
    seen.length = 0
    await deliver()
    expect(seen.filter(r => r.path.endsWith('/refunds'))).toHaveLength(0)
    expect((await rows<{ state: string }>('SELECT state FROM payments_refunds WHERE id = ?', second.refundId))[0]!.state).toBe('succeeded')
  })
})
