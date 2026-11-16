// Contract for payments.provider: a payment provider declares what it can do and implements only
// that (Box office specification, part 4, "The provider contract"). An integrated provider answers
// for itself; an attested one (cash, a standalone card machine) has a person state the outcome.
export type Capability = 'online-card' | 'reader' | 'cash' | 'attested' | 'refund' | 'partial-refund' | 'fees-reported' | 'payouts-reported' | 'webhooks' | 'test-mode'
export type Method = 'card_online' | 'card_reader' | 'card_attested' | 'cash' | 'other_attested'

/** What a provider is told about one attempt. */
export interface ProviderAttempt {
  id: string
  intentId: string
  providerAccountId: string
  /** The provider's own account or merchant id. */
  externalRef: string | null
  mode: 'live' | 'test'
  method: Method
  amountMinor: number
  currency: string
  idempotencyKey: string
  providerRef: string | null
  readerExternalRef: string | null
  /** When the attempt was written, before the provider was asked. */
  startedAt: number
  /**
   * Where the provider may send its webhook for this account, when Payments knows the site's address
   * (a request started the payment). A provider that is told per payment where to report uses it.
   */
  webhookUrl?: string
  /** Set when a person asks again after a start had no answer, so the first may still be running. */
  retrying?: boolean
}

/** The provider's truth about an attempt, now. */
export type ProviderAnswer
  = | { state: 'pending', providerRef?: string }
    | { state: 'succeeded', providerRef?: string, feeMinor?: number }
    | { state: 'failed', providerRef?: string, failureCode: string }
    | { state: 'cancelled', providerRef?: string }

/** A refund as its provider is told about it: always against the attempt that took the money. */
export interface ProviderRefund {
  id: string
  amountMinor: number
  currency: string
  idempotencyKey: string
  /**
   * How much of the attempt other refunds have taken back already (those that succeeded). A provider
   * with no idempotency key of its own compares it with its records, so asking twice refunds once.
   */
  refundedBeforeMinor: number
  attempt: ProviderAttempt
}

/** The provider's answer to a refund. */
export type RefundAnswer
  = | { state: 'pending', providerRef?: string }
    | { state: 'succeeded', providerRef?: string }
    | { state: 'failed', providerRef?: string, failureCode: string }

/** What the screen needs next after `start`. */
export type NextStep
  = | { kind: 'redirect', url: string }
    | { kind: 'client-secret', secret: string }
    | { kind: 'waiting-for-reader' }
    | { kind: 'none' }

export interface PaymentProvider {
  capabilities: readonly Capability[]
  /** The methods this provider takes, each on the channels it suits. */
  methods: readonly { method: Method, channels: readonly ('online' | 'desk')[] }[]
  /** The Worker secrets it needs, by name. None for cash and attested card. */
  secrets: readonly string[]
  /** Which of its secrets signs its webhooks, if it sends any. */
  webhookSecret?: string
  /** Begin a payment. Not given for an attested provider: a person records the answer instead. */
  start?: (attempt: ProviderAttempt) => Promise<{ next: NextStep, providerRef?: string, answer?: ProviderAnswer }>
  /** Ask the provider for the truth now. Required unless attested. */
  status?: (attempt: ProviderAttempt) => Promise<ProviderAnswer | 'unknown'>
  /**
   * Send money back with the refund's idempotency key, so asking twice refunds once. Not given for an
   * attested provider: a person hands the money back and confirms it.
   */
  refund?: (refund: ProviderRefund) => Promise<RefundAnswer>
  /** Ask the provider to stop a payment waiting on a reader; true once it confirms it stopped. */
  cancel?: (attempt: ProviderAttempt) => Promise<boolean>
  /**
   * Pair a card reader with this account, from the code the reader shows. Returns the provider's id
   * for the reader. Given only by a provider with the `reader` capability.
   */
  pairReader?: (account: { id: string, externalRef: string | null }, input: { pairingCode: string, label: string }) => Promise<{ externalRef: string }>
  /**
   * Check a webhook's signature; give the provider's event id, its type and the reference it
   * concerns. Null when the body cannot be read at all. Nothing in the body is trusted beyond which
   * attempt to ask about: the handler always asks `status` for the truth.
   */
  verifyWebhook?: (request: { body: string, headers: Record<string, string>, secret: string | undefined, url: string, providerAccountId: string }) => Promise<{ ok: boolean, eventId: string, type: string, providerRef?: string } | null>
}
