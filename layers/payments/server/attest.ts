// A cash or standalone-card payment, recorded by the person who took it. The attempt is written when
// they confirm it, then answered in their name; if that answer completes the intent, it settles.
import { all, createUnit, first, Refusal } from '#kit'
import { addAttempt, recordAnswer } from './answers'
import { getIntent } from './intents'
import { providerAccount, providers } from './providers'
import type { Method } from './points/provider'
import { amountFor, claimSplit, setReceipt } from './splits'
import type { Destination } from './points/settlement'

export interface AttestInput {
  intentId: string
  providerAccountId: string
  method: Extract<Method, 'cash' | 'card_attested' | 'other_attested'>
  /** Defaults to what is still to pay. Payments' own code only: the till splits by item (`split`). */
  amountMinor?: number
  /** For a sale split between people: which person is paying (1, 2, …). */
  split?: number
  /** Where that person's receipt goes once the sale is paid. */
  receipt?: Destination
  /** Cash only: what was handed over, for the change. */
  tenderedMinor?: number
  /** Other only: what it was, such as a voucher number or an invoice. */
  note?: string
  /** False records that the machine declined. */
  succeeded?: boolean
}

export async function attest(input: AttestInput): Promise<{ attemptId: string, settled: boolean, unfulfilled: boolean, changeMinor: number }> {
  const intent = await getIntent(input.intentId)
  if (!intent) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (intent.state !== 'open') throw new Refusal('payments.intent.not-open', 'This payment is no longer open.', { status: 409 })
  if (intent.channel !== 'desk') throw new Refusal('payments.attempt.desk-only', 'Cash and card machine payments are taken at the desk.', { status: 409 })
  if (intent.session_id && (await first<{ state: string }>('SELECT state FROM payments_sessions WHERE id = ?', intent.session_id))?.state !== 'open')
    throw new Refusal('payments.session.not-open', 'The till session for this payment is being cashed up or is closed.', { status: 409 })
  const account = await providerAccount(input.providerAccountId)
  const provider = account && (await providers()).get(account.provider)
  if (!account?.active || !provider || !provider.capabilities.includes('attested') || !provider.methods.some(m => m.method === input.method && m.channels.includes('desk')))
    throw new Refusal('payments.attempt.method-unavailable', 'That way of paying is not set up here.', { status: 409 })

  const attempts = await all<{ state: string, amount_minor: number }>('SELECT state, amount_minor FROM payments_attempts WHERE intent_id = ?', intent.id)
  if (attempts.some(a => ['started', 'pending', 'unknown'].includes(a.state))) throw new Refusal('payments.attempt.in-flight', 'Another payment for this is still waiting for its answer.', { status: 409 })
  const remaining = intent.amount_minor - attempts.filter(a => a.state === 'succeeded').reduce((s, a) => s + a.amount_minor, 0)
  const { amountMinor: amount, split, whole } = await amountFor(intent, remaining, input)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) throw new Refusal('payments.attempt.bad-amount', `The amount must be above nothing and no more than the ${remaining} still to pay.`, { status: 422, fields: { amountMinor: 'payments.attempt.bad-amount' } })
  const tendered = input.method === 'cash' ? input.tenderedMinor ?? amount : null
  if (tendered !== null && tendered < amount) throw new Refusal('payments.attempt.short', 'Less cash was handed over than the amount.', { status: 422, fields: { tenderedMinor: 'payments.attempt.short' } })

  const unit = createUnit()
  const attempt = addAttempt(unit.view(), { intentId: intent.id, providerAccountId: account.id, method: input.method, amountMinor: amount, tenderedMinor: tendered, note: input.method === 'other_attested' ? input.note?.trim() || null : null })
  if (split) claimSplit(unit.view(), split, attempt.id, input.receipt)
  if (whole && input.receipt) setReceipt(unit.view(), whole, input.receipt)
  await unit.commit()
  const result = await recordAnswer(attempt.id, input.succeeded === false ? { state: 'failed', failureCode: 'declined' } : { state: 'succeeded' }, { kind: 'person' })
  return { attemptId: attempt.id, settled: result.settled, unfulfilled: result.unfulfilled, changeMinor: tendered === null ? 0 : tendered - amount }
}
