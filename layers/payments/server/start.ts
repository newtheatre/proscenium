// Starting a payment with an integrated provider (Box office specification, part 4, startAttempt).
// The attempt is committed before the provider is called, through the kit's externalCall, with the
// attempt's idempotency key, so a retry after a lost connection asks the provider for money once.
// Whatever the provider says comes back as an answer like any other, so a payment it reports as
// already taken settles here, and one it cannot vouch for is left for the reconcile task.
import { all, createUnit, externalCall, first, isRefusal, log, Refusal } from '#kit'
import { addAttempt, recordAnswer, type AttemptRow } from './answers'
import { getIntent, intentStatus, type IntentStatus } from './intents'
import { reconcileAttempt } from './tasks/reconcile-attempts'
import { forProvider, providerAccount, providers } from './providers'
import type { Method, NextStep, ProviderAnswer } from './points/provider'

export interface StartInput {
  method: Method
  providerAccountId: string
  readerId?: string
  /** Defaults to what is still to pay. */
  amountMinor?: number
  /** The site's address, from the request, so a provider can be told where to send its webhook. */
  origin?: string
  /** The screen that started the payment, for a provider that sends the person back (RETURN_PATH). */
  returnTo?: string
}

/** A screen of this site's console a hand-off may return to: a plain path, never another site. */
export const RETURN_PATH = /^\/console(?:\/[\w-]+)*$/

export interface StartResult { attemptId: string, next: NextStep, state: string, settled: boolean, unfulfilled: boolean }

async function call(attempt: AttemptRow, origin?: string, retrying = false, returnTo?: string): Promise<StartResult> {
  const { provider, attempt: found } = await forProvider(attempt, origin)
  const asked = { ...found, ...(retrying ? { retrying } : {}), ...(returnTo ? { returnTo } : {}) }
  let next: NextStep = { kind: 'none' }
  let answer: ProviderAnswer | undefined
  const result = await externalCall('payments.start-payment', {
    reference: ['payments.attempt', attempt.id],
    key: attempt.idempotency_key,
    call: async () => {
      const started = await provider!.start!(asked)
      next = started.next
      answer = started.answer
      return { result: 'succeeded', providerReference: started.providerRef ?? started.answer?.providerRef }
    },
  })
  if (result.state === 'unknown') return { attemptId: attempt.id, next, state: 'started', settled: false, unfulfilled: false }
  if (result.state === 'failed') return { attemptId: attempt.id, next, state: 'failed', settled: false, unfulfilled: false }
  const recorded = await recordAnswer(attempt.id, answer ?? { state: 'pending', providerRef: result.outcome?.providerReference }, { kind: 'poll' })
  const state = (await first<{ state: string }>('SELECT state FROM payments_attempts WHERE id = ?', attempt.id))!.state
  return { attemptId: attempt.id, next, state, settled: recorded.settled, unfulfilled: recorded.unfulfilled }
}

/**
 * The same payment again, when the one waiting is with the same account and way of paying and its
 * provider says the person has still to finish it (a card form reloaded, or a card declined).
 */
async function resume(waiting: AttemptRow, accountId: string, input: StartInput): Promise<StartResult | null> {
  if (waiting.state !== 'pending' || waiting.provider_account_id !== accountId || waiting.method !== input.method) return null
  if (input.amountMinor !== undefined && input.amountMinor !== waiting.amount_minor) return null
  const { provider, attempt } = await forProvider(waiting, input.origin)
  const next = provider?.resume ? await provider.resume(attempt) : null
  return next ? { attemptId: waiting.id, next, state: waiting.state, settled: false, unfulfilled: false } : null
}

/**
 * Asks the providers about every payment for the intent still waiting, now, rather than waiting for
 * a webhook or the reconcile task. A final answer is recorded as the provider's, so a part settles as
 * it would from a webhook. For a page that has just watched the person pay. A provider that cannot
 * be reached leaves things as they were.
 */
export async function refreshIntent(intentId: string): Promise<IntentStatus | null> {
  const waiting = await all<AttemptRow>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state IN ('started', 'pending', 'unknown')", intentId)
  for (const attempt of waiting) {
    try {
      // Never marks an attempt unknown: that is the reconcile task's call, on its own clock.
      await reconcileAttempt(attempt, Number.POSITIVE_INFINITY)
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('payments.refresh-failed', { attemptId: attempt.id, error: String((error as Error)?.message ?? error) })
    }
  }
  return intentStatus(intentId)
}

/**
 * Starts a payment on an open intent with an integrated provider. Refused for an attested method,
 * while another payment for the intent is waiting, for more than is still to pay, and on a test-mode
 * account for anything but Payments' own test payment.
 */
export async function startAttempt(intentId: string, input: StartInput): Promise<StartResult> {
  const intent = await getIntent(intentId)
  if (!intent) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (intent.state !== 'open') throw new Refusal('payments.intent.not-open', 'This payment is no longer open.', { status: 409 })
  const account = await providerAccount(input.providerAccountId)
  const provider = account && (await providers()).get(account.provider)
  const channels = account ? JSON.parse(account.channels) as string[] : []
  if (!account?.active || !provider?.start || !channels.includes(intent.channel) || !provider.methods.some(m => m.method === input.method && m.channels.includes(intent.channel)))
    throw new Refusal('payments.attempt.method-unavailable', 'That way of paying is not set up here.', { status: 409 })
  if (account.mode === 'test') {
    const real = await first<{ n: number }>("SELECT count(*) AS n FROM payments_intent_parts WHERE intent_id = ? AND owner_module <> 'payments'", intent.id)
    if (real?.n) throw new Refusal('payments.attempt.test-mode', 'This provider account is in test mode, so it cannot take payment for a real sale.', { status: 409 })
  }
  if (input.readerId && !(await first('SELECT 1 FROM payments_readers WHERE id = ? AND provider_account_id = ? AND active = 1', input.readerId, account.id)))
    throw new Refusal('payments.attempt.reader-unavailable', 'That card reader is not paired with this account.', { status: 409 })
  const attempts = await all<AttemptRow>('SELECT * FROM payments_attempts WHERE intent_id = ?', intent.id)
  const waiting = attempts.find(a => ['started', 'pending', 'unknown'].includes(a.state))
  if (waiting) {
    const resumed = await resume(waiting, account.id, input)
    if (resumed) return resumed
    throw new Refusal('payments.attempt.in-flight', 'Another payment for this is still waiting for its answer.', { status: 409 })
  }
  const remaining = intent.amount_minor - attempts.filter(a => a.state === 'succeeded').reduce((s, a) => s + a.amount_minor, 0)
  const amount = input.amountMinor ?? remaining
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) throw new Refusal('payments.attempt.bad-amount', `The amount must be above nothing and no more than the ${remaining} still to pay.`, { status: 422 })
  if (amount < remaining && intent.channel !== 'desk') throw new Refusal('payments.attempt.split-desk-only', 'Only the desk takes a payment in parts.', { status: 422 })

  // The attempt is committed before the provider is asked. The busy-reader index refuses a second
  // payment on a reader still waiting for one.
  const unit = createUnit()
  const added = addAttempt(unit.view(), { intentId: intent.id, providerAccountId: account.id, method: input.method, amountMinor: amount, readerId: input.readerId ?? null })
  await unit.commit()
  return call(added, input.origin, false, input.returnTo && RETURN_PATH.test(input.returnTo) ? input.returnTo : undefined)
}

/** Calls the provider again for an attempt whose start had no answer, with the same key. */
export async function retryStart(attemptId: string, origin?: string): Promise<StartResult> {
  const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptId)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (attempt.state !== 'started') throw new Refusal('payments.attempt.already-answered', 'This payment already has its answer.', { status: 409 })
  return call(attempt, origin, true)
}

/**
 * Asks the provider to stop a payment waiting on a reader. The attempt is cancelled only when the
 * provider confirms it stopped; if the reader had already taken the payment, the provider's answer
 * wins and the payment succeeds (Box office specification, part 4, "Cancelling at the reader").
 */
export async function cancelAttempt(attemptId: string): Promise<{ state: string }> {
  const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptId)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (!['started', 'pending'].includes(attempt.state)) throw new Refusal('payments.attempt.already-answered', 'This payment already has its answer.', { status: 409 })
  const { provider, attempt: asked } = await forProvider(attempt)
  if (!provider?.cancel) throw new Refusal('payments.attempt.cannot-cancel', 'This payment cannot be stopped from here.', { status: 409 })
  if (await provider.cancel(asked)) await recordAnswer(attempt.id, { state: 'cancelled', providerRef: attempt.provider_ref ?? undefined }, { kind: 'poll' })
  else {
    const answer = await provider.status?.(asked).catch(() => 'unknown' as const)
    if (answer && answer !== 'unknown' && answer.state !== 'pending') await recordAnswer(attempt.id, answer, { kind: 'poll' })
  }
  return { state: (await first<{ state: string }>('SELECT state FROM payments_attempts WHERE id = ?', attempt.id))!.state }
}

/**
 * Asks each provider to stop a payment a seller has given up on, as a best effort that waits for no
 * answer: whatever the provider says later is recorded as usual, and money it took goes back.
 */
export async function stopWaiting(attemptIds: string[]): Promise<void> {
  for (const id of attemptIds) {
    const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', id)
    if (!attempt || !['started', 'pending'].includes(attempt.state)) continue
    const { provider, attempt: asked } = await forProvider(attempt)
    await provider?.cancel?.(asked).catch(() => false)
  }
}
