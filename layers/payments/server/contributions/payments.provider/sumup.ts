// The SumUp card reader, driven from the till through SumUp's Cloud API (Box office specification,
// part 4; Matt's question 2; https://developer.sumup.com/terminal-payments/cloud-api). The provider
// account's external ref is the merchant code; a reader's is SumUp's reader id.
//
// SumUp takes no idempotency key on a reader checkout or a refund, so this provider looks before it
// acts. Every checkout carries the attempt's id as the affiliate's foreign_transaction_id, and the
// truth about an attempt is read from SumUp's transaction with that id. A retried start finds the
// transaction and does not ask the reader again; a refund compares what SumUp has already refunded
// with what Payments had refunded before it, and sends nothing when SumUp has it already.
//
// SumUp does not sign the webhook a reader checkout sends. Its address names the attempt and carries a
// token made from the API key, the provider account and that attempt, so a delivery without it is
// stored and not acted on, and one address prompts a look at its own attempt only. As for every
// provider, the body is never trusted: the job reads the transaction. Payments never logs the
// address; Cloudflare's request logs record it, as they do every request.
import { credential, nowMs } from '#kit'
import { sumup, SumUpError } from '../../calls/sumup/client'
import type { PaymentProvider, ProviderAnswer, ProviderAttempt, RefundAnswer } from '../../points/provider'

const API_KEY = 'PAYMENTS_SUMUP_API_KEY'
const AFFILIATE_KEY = 'PAYMENTS_SUMUP_AFFILIATE_KEY'
const APP_ID = 'PAYMENTS_SUMUP_APP_ID'
// A checkout must start on the reader within 60 seconds of being sent (SumUp's Cloud API). With no
// transaction well after that, the card was never presented.
const NOT_STARTED_AFTER_MS = 10 * 60_000 // not-policy: SumUp's 60-second rule with a wide margin

interface Transaction { id: string, status: string, amount: number, currency: string, fee_amount?: number | null, events?: { type: string, status: string, amount: number }[] }

async function secret(name: string, account: string): Promise<string> {
  const value = await credential(name, account)
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** Digits after the point in a currency's minor unit, such as 2 for GBP. */
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 // not-policy: most currencies' minor unit
}

const toMinor = (major: number, digits: number) => Math.round(major * 10 ** digits) // not-policy: decimal places
const toMajor = (minor: number, digits: number) => minor / 10 ** digits // not-policy: decimal places

function merchant(attempt: { externalRef: string | null }): string {
  if (!attempt.externalRef) throw new Error('This SumUp account has no merchant code')
  return encodeURIComponent(attempt.externalRef)
}

/** The transaction SumUp holds for an attempt, found by the attempt's id; null while there is none. */
async function transactionOf(attempt: ProviderAttempt): Promise<Transaction | null> {
  try {
    return await sumup<Transaction>('GET', `/v2.1/merchants/${merchant(attempt)}/transactions`, { key: await secret(API_KEY, attempt.providerAccountId), query: { foreign_transaction_id: attempt.id } })
  }
  catch (error) {
    if (error instanceof SumUpError && error.status === 404) return null // not-policy: HTTP not found
    throw error
  }
}

export function answerOf(transaction: Transaction, attempt: ProviderAttempt): ProviderAnswer {
  const providerRef = attempt.providerRef ?? undefined
  switch (transaction.status) {
    case 'SUCCESSFUL':
    case 'REFUNDED': {
      const fee = typeof transaction.fee_amount === 'number' && transaction.currency === attempt.currency ? toMinor(transaction.fee_amount, minorDigits(attempt.currency)) : undefined
      return { state: 'succeeded', providerRef, feeMinor: fee }
    }
    case 'FAILED': return { state: 'failed', providerRef, failureCode: 'declined' }
    case 'CANCELLED': return { state: 'cancelled', providerRef }
    default: return { state: 'pending', providerRef }
  }
}

async function read(attempt: ProviderAttempt): Promise<ProviderAnswer | 'unknown'> {
  const transaction = await transactionOf(attempt)
  if (transaction) return answerOf(transaction, attempt)
  if (nowMs() - attempt.startedAt > NOT_STARTED_AFTER_MS) return { state: 'failed', providerRef: attempt.providerRef ?? undefined, failureCode: 'not-started' }
  return { state: 'pending', providerRef: attempt.providerRef ?? undefined }
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal

/** The token in an attempt's webhook address, from the API key, so it changes when the key does. */
export async function webhookToken(providerAccountId: string, attemptId: string): Promise<string | null> {
  const key = await credential(API_KEY, providerAccountId)
  if (!key) return null
  const hmac = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(`payments.sumup.webhook:${providerAccountId}:${attemptId}`)))
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** A refusal SumUp gave to the request itself, which asking again will not change. */
const refused = (error: unknown): error is SumUpError => error instanceof SumUpError && [400, 404, 409, 422].includes(error.status) // not-policy: HTTP statuses from SumUp's API reference

export default {
  capabilities: ['reader', 'refund', 'partial-refund', 'fees-reported', 'webhooks'],
  methods: [{ method: 'card_reader', channels: ['desk'] }],
  secrets: [API_KEY, AFFILIATE_KEY, APP_ID],

  async start(attempt) {
    // A start asked again after a lost answer finds the transaction the first one made.
    const existing = await transactionOf(attempt)
    if (existing) return { next: { kind: 'none' }, answer: answerOf(existing, attempt) }
    if (!attempt.readerExternalRef) return { next: { kind: 'none' }, answer: { state: 'failed', failureCode: 'no-reader' } }
    const token = attempt.webhookUrl ? await webhookToken(attempt.providerAccountId, attempt.id) : null
    try {
      const created = await sumup<{ data: { client_transaction_id: string } }>('POST', `/v0.1/merchants/${merchant(attempt)}/readers/${encodeURIComponent(attempt.readerExternalRef)}/checkout`, {
        key: await secret(API_KEY, attempt.providerAccountId),
        body: {
          total_amount: { value: attempt.amountMinor, currency: attempt.currency, minor_unit: minorDigits(attempt.currency) },
          affiliate: { app_id: await secret(APP_ID, attempt.providerAccountId), key: await secret(AFFILIATE_KEY, attempt.providerAccountId), foreign_transaction_id: attempt.id },
          return_url: attempt.webhookUrl && token ? `${attempt.webhookUrl}?${new URLSearchParams({ attempt: attempt.id, token })}` : undefined,
        },
      })
      return { next: { kind: 'waiting-for-reader' }, providerRef: created?.data.client_transaction_id }
    }
    catch (error) {
      // Refused outright on a first try (the reader is offline or busy with something else): the
      // payment failed and another way to pay may be offered. Asked again, a refusal may only mean the
      // first try is still waiting on the reader, so it is left for the reconcile task.
      if (refused(error) && !attempt.retrying) return { next: { kind: 'none' }, answer: { state: 'failed', failureCode: error.code ?? `http-${error.status}` } }
      throw error
    }
  },

  status: read,

  async cancel(attempt) {
    if (!attempt.readerExternalRef) return false
    // Stopping is asynchronous: SumUp reports the stopped payment as failed, through the webhook and
    // the transaction, so nothing here says it stopped.
    await sumup('POST', `/v0.1/merchants/${merchant(attempt)}/readers/${encodeURIComponent(attempt.readerExternalRef)}/terminate`, { key: await secret(API_KEY, attempt.providerAccountId) })
    return false
  },

  async refund(refund): Promise<RefundAnswer> {
    const transaction = await transactionOf(refund.attempt)
    if (!transaction) return { state: 'failed', failureCode: 'no-transaction' }
    const digits = minorDigits(refund.currency)
    const refundedThere = (transaction.events ?? []).filter(e => e.type === 'REFUND' && e.status !== 'FAILED').reduce((sum, e) => sum + toMinor(Math.abs(e.amount), digits), 0)
    if (refundedThere >= refund.refundedBeforeMinor + refund.amountMinor) return { state: 'succeeded', providerRef: transaction.id }
    try {
      await sumup('POST', `/v1.0/merchants/${merchant(refund.attempt)}/payments/${encodeURIComponent(transaction.id)}/refunds`, { key: await secret(API_KEY, refund.attempt.providerAccountId), body: { amount: toMajor(refund.amountMinor, digits) } })
      return { state: 'succeeded', providerRef: transaction.id }
    }
    catch (error) {
      if (refused(error)) return { state: 'failed', providerRef: transaction.id, failureCode: error.code ?? `http-${error.status}` }
      throw error
    }
  },

  async pairReader(account, input) {
    const reader = await sumup<{ id: string }>('POST', `/v0.1/merchants/${merchant(account)}/readers`, { key: await secret(API_KEY, account.id), body: { pairing_code: input.pairingCode, name: input.label } })
    if (!reader?.id) throw new Error('SumUp paired no reader')
    return { externalRef: reader.id }
  },

  async verifyWebhook({ body, url, providerAccountId }) {
    let event: { id?: string, event_type?: string, payload?: { client_transaction_id?: string } }
    try {
      event = JSON.parse(body)
    }
    catch {
      return null
    }
    if (!event.id || !event.event_type) return null
    const query = new URL(url).searchParams
    const attemptId = query.get('attempt') ?? ''
    const expected = attemptId ? await webhookToken(providerAccountId, attemptId) : null
    const ok = !!expected && sameText(query.get('token') ?? '', expected)
    return { ok, eventId: event.id, type: event.event_type, attemptId: ok ? attemptId : undefined }
  },
} satisfies PaymentProvider
