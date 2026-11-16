// Stripe, for card payments online (Box office specification, part 4; Matt's question 2). A payment is
// a Stripe PaymentIntent: start creates one and hands its client secret to the checkout page, which
// takes the card with Stripe's own form. Stripe's answer is always read back with status, never taken
// from a webhook's body. Keys are Worker secrets in the first release (Matt's question 3): the secret
// key and the webhook signing secret. A secret key for test mode starts sk_test_.
import { credential, nowMs } from '#kit'
import { stripe, StripeError } from '../../calls/stripe/client'
import type { PaymentProvider, ProviderAnswer, ProviderAttempt, RefundAnswer } from '../../points/provider'

const SECRET_KEY = 'PAYMENTS_STRIPE_SECRET_KEY'
const WEBHOOK_SECRET = 'PAYMENTS_STRIPE_WEBHOOK_SECRET'
// Stripe's own default tolerance for a signed webhook's timestamp (https://docs.stripe.com/webhooks).
const TOLERANCE_SECONDS = 300 // not-policy: Stripe's documented default

interface BalanceTransaction { fee: number, currency: string }
interface Charge { balance_transaction: BalanceTransaction | string | null }
interface PaymentIntent { id: string, status: string, client_secret: string, amount: number, currency: string, latest_charge: Charge | string | null }
interface Refund { id: string, status: string, failure_reason?: string | null }

async function secretKey(): Promise<string> {
  const key = await credential(SECRET_KEY)
  if (!key) throw new Error(`${SECRET_KEY} is not set`)
  return key
}

/** The fee Stripe kept, when it is in the payment's own currency. */
function feeOf(intent: PaymentIntent): number | undefined {
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null
  return balance && balance.currency === intent.currency ? balance.fee : undefined
}

export function answerOf(intent: PaymentIntent): ProviderAnswer {
  switch (intent.status) {
    case 'succeeded': return { state: 'succeeded', providerRef: intent.id, feeMinor: feeOf(intent) }
    case 'canceled': return { state: 'cancelled', providerRef: intent.id }
    // A declined card leaves the payment waiting for another card, which the customer may still give.
    default: return { state: 'pending', providerRef: intent.id }
  }
}

function refundAnswerOf(refund: Refund): RefundAnswer {
  if (refund.status === 'succeeded') return { state: 'succeeded', providerRef: refund.id }
  if (refund.status === 'failed' || refund.status === 'canceled') return { state: 'failed', providerRef: refund.id, failureCode: refund.failure_reason ?? refund.status }
  return { state: 'pending', providerRef: refund.id }
}

const hex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], byte => Number.parseInt(byte, 16)) // not-policy: hexadecimal

/** Checks a Stripe-Signature header: t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">, any v1 may match. */
export async function signatureOk(header: string | undefined, body: string, secret: string | undefined): Promise<boolean> {
  if (!header || !secret) return false
  const parts = header.split(',').map(p => p.split('=') as [string, string])
  const t = parts.find(([k]) => k === 't')?.[1]
  const signatures = parts.filter(([k, v]) => k === 'v1' && /^[0-9a-f]{64}$/.test(v ?? '')).map(([, v]) => v) // not-policy: a SHA-256 signature in hexadecimal
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false
  if (Math.abs(nowMs() / 1000 - Number(t)) > TOLERANCE_SECONDS) return false // not-policy: milliseconds to seconds
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const signed = new TextEncoder().encode(`${t}.${body}`)
  for (const signature of signatures) if (await crypto.subtle.verify('HMAC', key, hex(signature), signed)) return true
  return false
}

async function read(attempt: ProviderAttempt): Promise<ProviderAnswer | 'unknown'> {
  if (!attempt.providerRef) return 'unknown'
  try {
    return answerOf(await stripe<PaymentIntent>('GET', `/payment_intents/${encodeURIComponent(attempt.providerRef)}`, { key: await secretKey(), params: { expand: ['latest_charge.balance_transaction'] } }))
  }
  catch (error) {
    if (error instanceof StripeError && error.code === 'resource_missing') return { state: 'failed', providerRef: attempt.providerRef, failureCode: 'resource_missing' }
    throw error
  }
}

export default {
  capabilities: ['online-card', 'refund', 'partial-refund', 'fees-reported', 'webhooks', 'test-mode'],
  methods: [{ method: 'card_online', channels: ['online'] }],
  secrets: [SECRET_KEY, WEBHOOK_SECRET],
  webhookSecret: WEBHOOK_SECRET,

  async start(attempt) {
    const intent = await stripe<PaymentIntent>('POST', '/payment_intents', {
      key: await secretKey(),
      idempotencyKey: attempt.idempotencyKey,
      params: {
        amount: attempt.amountMinor,
        currency: attempt.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { attempt: attempt.id, intent: attempt.intentId },
      },
    })
    return { next: { kind: 'client-secret', secret: intent.client_secret }, providerRef: intent.id, answer: answerOf(intent) }
  },

  status: read,

  async refund(refund) {
    if (!refund.attempt.providerRef) return { state: 'failed', failureCode: 'no-payment-reference' }
    try {
      return refundAnswerOf(await stripe<Refund>('POST', '/refunds', {
        key: await secretKey(),
        idempotencyKey: refund.idempotencyKey,
        params: { payment_intent: refund.attempt.providerRef, amount: refund.amountMinor, metadata: { refund: refund.id } },
      }))
    }
    catch (error) {
      // Stripe refusing outright (already refunded, more than was paid) will not change on asking again.
      if (error instanceof StripeError && error.final) return { state: 'failed', failureCode: error.code ?? `http-${error.status}` }
      throw error
    }
  },

  async verifyWebhook({ body, headers, secret }) {
    let event: { id?: string, type?: string, data?: { object?: { id?: string, object?: string, payment_intent?: string | null } } }
    try {
      event = JSON.parse(body)
    }
    catch {
      return null
    }
    if (!event.id || !event.type) return null
    const object = event.data?.object
    const providerRef = object?.object === 'payment_intent' ? object.id : (typeof object?.payment_intent === 'string' ? object.payment_intent : undefined)
    return { ok: await signatureOk(headers['stripe-signature'], body, secret), eventId: event.id, type: event.type, providerRef }
  },
} satisfies PaymentProvider
