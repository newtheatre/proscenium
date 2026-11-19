// The Stripe provider against a pretend Stripe: what it sends (amounts, the idempotency key, the
// pinned version), how it reads Stripe's answers, how it checks a webhook's signature, and refunds.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, nowMs, setClock } from '#kit'
import { collect, methodsFor, refreshIntent, requestRefund, startAttempt } from '../../server/services'
import { STRIPE_VERSION, transport } from '../../server/calls/stripe/client'
import stripeProvider from '../../server/contributions/payments.provider/stripe'
import webhookRoute from '../../server/api/payments/webhooks/[account].post'
import { call, deliver, env, inContext, rows, saveKey, sent, server, setModule } from '../../../../tests/integration/helpers'

const NOV_16 = Date.UTC(2026, 10, 16, 12)
const MINUTE = 60_000
const WEBHOOK_SECRET = 'whsec_test'
let account: string

interface Seen { method: string, url: string, headers: Record<string, string>, body: URLSearchParams }
const seen: Seen[] = []
let intents = new Map<string, { id: string, status: string, client_secret: string, amount: number, currency: string, latest_charge: unknown }>()
let refundReply: { status: number, body: unknown } = { status: 200, body: { id: 're_1', status: 'succeeded' } }

const real = transport.fetch
function fakeStripe(url: string, init: RequestInit): Promise<Response> {
  const headers = init.headers as Record<string, string>
  const body = new URLSearchParams(init.method === 'GET' ? new URL(url).search : String(init.body ?? ''))
  seen.push({ method: init.method!, url, headers, body })
  const json = (status: number, value: unknown) => Promise.resolve(new Response(JSON.stringify(value), { status }))
  const path = new URL(url).pathname
  if (init.method === 'POST' && path === '/v1/payment_intents') {
    const key = headers['Idempotency-Key']!
    const id = `pi_${key.slice(-8)}`
    const pi = intents.get(id) ?? { id, status: 'requires_payment_method', client_secret: `${id}_secret`, amount: Number(body.get('amount')), currency: body.get('currency')!, latest_charge: null }
    intents.set(id, pi)
    return json(200, pi)
  }
  if (init.method === 'GET' && path.startsWith('/v1/payment_intents/')) {
    const pi = intents.get(path.split('/').pop()!)
    return pi ? json(200, pi) : json(404, { error: { code: 'resource_missing', message: 'No such payment_intent' } })
  }
  if (init.method === 'POST' && path === '/v1/refunds') return json(refundReply.status, refundReply.body)
  return json(404, { error: { code: 'resource_missing' } })
}

async function signed(payload: unknown, at = NOV_16, secret = WEBHOOK_SECRET): Promise<{ body: string, signature: string }> {
  const body = JSON.stringify(payload)
  const t = Math.floor(at / 1000)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${body}`)))
  return { body, signature: `t=${t},v1=${[...mac].map(b => b.toString(16).padStart(2, '0')).join('')}` }
}

const handle = server({ 'POST /api/payments/webhooks/:account': webhookRoute })
const webhook = (body: string, signature: string) => call(handle, 'POST', `/api/payments/webhooks/${account}`, { body: JSON.parse(body), headers: { 'stripe-signature': signature } })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}

async function order(amount: number): Promise<{ intentId: string, orderId: string, partId: string }> {
  const orderId = newId('tko')
  const { intentId, partIds } = await commit(async (unit) => {
    const view = unit.view()
    view.add({ sql: "INSERT INTO tickets_orders (id, amount_minor, state) VALUES (?, ?, 'held')", params: [orderId, amount] })
    return collect(view, { parts: [{ owner: { module: 'tickets', record: orderId }, amountMinor: amount }], expiresAt: nowMs() + 15 * MINUTE })
  })
  return { intentId, orderId, partId: partIds[0]! }
}

beforeAll(async () => {
  setClock(NOV_16)
  transport.fetch = fakeStripe
  for (const id of ['finance', 'payments', 'tickets']) await setModule(id, true)
  await commit(unit => changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true }))
  account = newId('ppa')
  await env.DB.prepare("INSERT INTO payments_provider_accounts (id, provider, label, channels, mode, active, created_at, updated_at) VALUES (?, 'stripe', 'Stripe', '[\"online\"]', 'live', 1, ?, ?)").bind(account, NOV_16, NOV_16).run()
})

afterAll(async () => {
  transport.fetch = real
  await saveKey('PAYMENTS_STRIPE_SECRET_KEY', null)
  await saveKey('PAYMENTS_STRIPE_WEBHOOK_SECRET', null)
  await saveKey('PAYMENTS_STRIPE_PUBLISHABLE_KEY', null)
})

beforeEach(async () => {
  setClock(NOV_16)
  await saveKey('PAYMENTS_STRIPE_SECRET_KEY', 'sk_live_test')
  await saveKey('PAYMENTS_STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET)
  await saveKey('PAYMENTS_STRIPE_PUBLISHABLE_KEY', 'pk_live_test')
  seen.length = 0
  sent.length = 0
  intents = new Map()
  refundReply = { status: 200, body: { id: 're_1', status: 'succeeded' } }
})

describe('connecting', () => {
  it('is not offered while a secret is missing', async () => {
    await saveKey('PAYMENTS_STRIPE_WEBHOOK_SECRET', null)
    expect((await inContext(() => methodsFor('online'))).some(m => m.providerAccountId === account)).toBe(false)
    await saveKey('PAYMENTS_STRIPE_WEBHOOK_SECRET', WEBHOOK_SECRET)
    expect((await inContext(() => methodsFor('online'))).some(m => m.providerAccountId === account)).toBe(true)
  })

  it('is not offered without the publishable key the card form loads with', async () => {
    await saveKey('PAYMENTS_STRIPE_PUBLISHABLE_KEY', null)
    expect((await inContext(() => methodsFor('online'))).some(m => m.providerAccountId === account)).toBe(false)
  })
})

describe('start', () => {
  it('creates a PaymentIntent with the attempt\'s key and hands back its client secret', async () => {
    const { intentId } = await order(2500)
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    const [request] = seen
    expect(request!.headers).toMatchObject({ 'Authorization': 'Bearer sk_live_test', 'Stripe-Version': STRIPE_VERSION })
    expect(request!.body.get('amount')).toBe('2500')
    expect(request!.body.get('currency')).toBe('gbp')
    expect(request!.body.get('automatic_payment_methods[enabled]')).toBe('true')
    expect(request!.body.get('metadata[attempt]')).toBe(out.attemptId)
    const [attempt] = await rows<{ provider_ref: string, idempotency_key: string, state: string }>('SELECT provider_ref, idempotency_key, state FROM payments_attempts WHERE id = ?', out.attemptId)
    expect(request!.headers['Idempotency-Key']).toBe(attempt!.idempotency_key)
    expect(out.next).toEqual({ kind: 'client-secret', provider: 'stripe', secret: `${attempt!.provider_ref}_secret`, publishableKey: 'pk_live_test' })
    expect(attempt!.state).toBe('pending')
  })

  it('hands the same payment back while the buyer has still to finish it, and nothing new is made', async () => {
    const { intentId } = await order(1800)
    const first = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    const made = seen.filter(r => r.method === 'POST').length
    const again = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    expect(again.attemptId).toBe(first.attemptId)
    expect(again.next).toEqual(first.next)
    expect(seen.filter(r => r.method === 'POST').length).toBe(made)
  })

  it('refuses a second start once Stripe is working on the payment', async () => {
    const { intentId } = await order(1900)
    const first = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    const [attempt] = await rows<{ provider_ref: string }>('SELECT provider_ref FROM payments_attempts WHERE id = ?', first.attemptId)
    intents.get(attempt!.provider_ref)!.status = 'processing'
    await expect(inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))).rejects.toMatchObject({ code: 'payments.attempt.in-flight' })
  })
})

describe('refreshIntent', () => {
  it('settles at once when Stripe says the payment succeeded, with no webhook', async () => {
    const { intentId } = await order(2200)
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    const [attempt] = await rows<{ provider_ref: string }>('SELECT provider_ref FROM payments_attempts WHERE id = ?', out.attemptId)
    intents.get(attempt!.provider_ref)!.status = 'succeeded'
    const status = await inContext(() => refreshIntent(intentId))
    expect(status).toMatchObject({ state: 'succeeded', paidMinor: 2200, waiting: false })
  })

  it('leaves a payment the buyer has not finished waiting, and does nothing once settled', async () => {
    const { intentId } = await order(2300)
    const out = await inContext(() => startAttempt(intentId, { providerAccountId: account, method: 'card_online' }))
    expect(await inContext(() => refreshIntent(intentId))).toMatchObject({ state: 'open', paidMinor: 0, waiting: true })
    const [attempt] = await rows<{ provider_ref: string }>('SELECT provider_ref FROM payments_attempts WHERE id = ?', out.attemptId)
    intents.get(attempt!.provider_ref)!.status = 'succeeded'
    await inContext(() => refreshIntent(intentId))
    const asked = seen.length
    expect(await inContext(() => refreshIntent(intentId))).toMatchObject({ state: 'succeeded', paidMinor: 2300 })
    expect(seen.length).toBe(asked)
  })
})

describe('webhooks', () => {
  async function paying(amount: number) {
    const placed = await order(amount)
    const out = await inContext(() => startAttempt(placed.intentId, { providerAccountId: account, method: 'card_online' }))
    const [attempt] = await rows<{ provider_ref: string }>('SELECT provider_ref FROM payments_attempts WHERE id = ?', out.attemptId)
    return { ...placed, attemptId: out.attemptId, ref: attempt!.provider_ref }
  }

  it('settles from Stripe\'s own answer, with the fee it kept, after a signed event', async () => {
    const { intentId, orderId, attemptId, ref } = await paying(3000)
    intents.get(ref)!.status = 'succeeded'
    intents.get(ref)!.latest_charge = { balance_transaction: { fee: 65, currency: 'gbp' } }
    const { body, signature } = await signed({ id: 'evt_ok', type: 'payment_intent.succeeded', data: { object: { id: ref, object: 'payment_intent' } } })
    expect((await webhook(body, signature)).status).toBe(200)
    const outcomes = await deliver()
    expect(outcomes, JSON.stringify(await rows('SELECT name, last_error FROM core_jobs WHERE last_error IS NOT NULL'))).toEqual(['done'])
    expect((await rows<{ state: string }>('SELECT state FROM tickets_orders WHERE id = ?', orderId))[0]!.state).toBe('paid')
    expect(seen.some(r => r.method === 'GET' && r.body.get('expand[]') === 'latest_charge.balance_transaction')).toBe(true)
    expect(await rows('SELECT kind FROM finance_postings WHERE source_id IN (?, ?) ORDER BY kind', intentId, attemptId)).toEqual([{ kind: 'fee' }, { kind: 'sale' }])
  })

  it('stores but does not act on a forged, stale or unsigned event', async () => {
    const { ref } = await paying(1000)
    const payload = { id: 'evt_bad', type: 'payment_intent.succeeded', data: { object: { id: ref, object: 'payment_intent' } } }
    const forged = await signed(payload, NOV_16, 'whsec_wrong')
    expect((await webhook(forged.body, forged.signature)).status).toBe(400)
    const stale = await signed({ ...payload, id: 'evt_stale' }, NOV_16 - 10 * MINUTE)
    expect((await webhook(stale.body, stale.signature)).status).toBe(400)
    const good = await signed({ ...payload, id: 'evt_unsigned' })
    expect((await webhook(good.body, '')).status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('reads a charge event as being about its PaymentIntent', async () => {
    const verified = await stripeProvider.verifyWebhook!({ body: JSON.stringify({ id: 'evt_c', type: 'charge.refunded', data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_9' } } }), headers: {}, secret: undefined })
    expect(verified).toMatchObject({ ok: false, eventId: 'evt_c', providerRef: 'pi_9' })
  })
})

describe('refunds', () => {
  async function paid(amount: number) {
    const placed = await order(amount)
    const out = await inContext(() => startAttempt(placed.intentId, { providerAccountId: account, method: 'card_online' }))
    const [attempt] = await rows<{ provider_ref: string }>('SELECT provider_ref FROM payments_attempts WHERE id = ?', out.attemptId)
    intents.get(attempt!.provider_ref)!.status = 'succeeded'
    const { body, signature } = await signed({ id: `evt_${out.attemptId}`, type: 'payment_intent.succeeded', data: { object: { id: attempt!.provider_ref, object: 'payment_intent' } } })
    await webhook(body, signature)
    await deliver()
    return { ...placed, ref: attempt!.provider_ref }
  }

  it('sends the refund with its own key against the PaymentIntent', async () => {
    const { partId, ref } = await paid(4000)
    const { refundId } = await commit(unit => requestRefund(unit.view(), { partId, amountMinor: 1500, requestedBy: null }))
    seen.length = 0
    await deliver()
    const request = seen.find(r => r.url.endsWith('/v1/refunds'))!
    expect(request.body.get('payment_intent')).toBe(ref)
    expect(request.body.get('amount')).toBe('1500')
    const [refund] = await rows<{ idempotency_key: string, state: string }>('SELECT idempotency_key, state FROM payments_refunds WHERE id = ?', refundId)
    expect(request.headers['Idempotency-Key']).toBe(refund!.idempotency_key)
    expect(refund!.state).toBe('succeeded')
  })

  it('records a refund Stripe refuses outright as failed', async () => {
    const { partId } = await paid(2000)
    refundReply = { status: 400, body: { error: { code: 'charge_already_refunded', message: 'Already refunded' } } }
    const { refundId } = await commit(unit => requestRefund(unit.view(), { partId, amountMinor: 2000, requestedBy: null }))
    await deliver()
    const [refund] = await rows<{ state: string }>('SELECT state FROM payments_refunds WHERE id = ?', refundId)
    expect(refund).toEqual({ state: 'failed' })
  })
})
