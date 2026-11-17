// Paid in part, then abandoned (Box office specification, part 4; BO-35): the customer paid some of a
// desk sale and walked away. "Give back what was taken" ends the sale as unfulfilled in one unit:
// every part is released at once, so the seats or stock go back on sale, and each attempt's money is
// held in payments.unfulfilled and refunded in full by the way it was paid. Nothing was sold, so no
// income or deferred income is touched. Cash, a standalone card machine and the SumUp app are handed
// back by the seller, who confirms it in the same action; a card the provider refunds is sent by the
// send-refund job, and one that fails shows under Needs attention with the money still held.
import { all, can, createUnit, first, isRefusal, log, nowMs, Refusal, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { holdAndRefund, type AttemptRow } from './answers'
import { getIntent, ownersOf, partsOf, releaseParts } from './intents'
import { providerAccount, providers } from './providers'
import { confirmRefund } from './refunds'

export interface GivenBack {
  /** Handed back by the seller and confirmed: cash, a standalone machine, the SumUp app. */
  handedBack: { method: string, amountMinor: number }[]
  /** Sent back through the provider by the send-refund job. */
  sent: { method: string, amountMinor: number }[]
  /** Hand-backs the seller could not confirm here (no open till session for cash); they wait on Refunds. */
  unconfirmed: number
}

async function refundsItself(attempt: AttemptRow): Promise<boolean> {
  const account = await providerAccount(attempt.provider_account_id)
  return !!account && !!(await providers()).get(account.provider)?.refund
}

/**
 * Ends a part-paid desk sale and gives back what was taken. The seller who took it may do so alone
 * while their till session is open; anyone else needs payments.refund.approve, within the
 * self-approve limit.
 */
export async function giveBack(unit: UnitView, intentId: string, actor: Actor): Promise<{ refundIds: string[], attempts: AttemptRow[] }> {
  const intent = await getIntent(intentId)
  if (!intent) throw new Refusal('core.not-found', 'There is no such payment.', { status: 404 })
  if (intent.state !== 'open') throw new Refusal('payments.intent.not-open', 'This payment is no longer open.', { status: 409 })
  if (intent.channel !== 'desk') throw new Refusal('payments.attempt.desk-only', 'Only a desk sale is given back here.', { status: 409 })
  const attempts = await all<AttemptRow>('SELECT * FROM payments_attempts WHERE intent_id = ? ORDER BY started_at', intent.id)
  if (attempts.some(a => ['started', 'pending', 'unknown'].includes(a.state)))
    throw new Refusal('payments.attempt.in-flight', 'Another payment for this is still waiting for its answer.', { status: 409, remedy: 'Wait for its answer, or cancel it on the reader first.' })
  const paid = attempts.filter(a => a.state === 'succeeded')
  if (!paid.length) throw new Refusal('payments.giveback.nothing-taken', 'Nothing has been taken for this sale.', { status: 409, remedy: 'Cancel the sale instead.' })

  const seller = !!intent.session_id && !!actor.accountId && !!(await first(
    `SELECT 1 FROM payments_sessions WHERE id = ?1 AND state = 'open' AND opened_by IN (${accountScopeSql('?2')})`, intent.session_id, actor.accountId))
  if (!seller) {
    if (!(await can(actor, 'payments.refund.approve')).allowed)
      throw new Refusal('payments.giveback.not-yours', 'Only the seller who took this payment can give it back while their session is open.', { status: 403, remedy: 'Ask the seller, or someone allowed to approve refunds.' })
    const taken = paid.reduce((sum, a) => sum + a.amount_minor, 0)
    const limit = await useSetting('payments.refunds.self-approve-up-to') as number
    if (taken > limit)
      throw new Refusal('payments.giveback.over-limit', 'This is more than you may give back on your own.', { status: 403, remedy: 'Ask the seller to do it while their session is open.' })
  }

  const parts = await partsOf(intent.id)
  unit.add({
    sql: `UPDATE payments_intents SET state = 'unfulfilled', updated_at = ? WHERE id = ? AND state = 'open'
      AND NOT EXISTS (SELECT 1 FROM payments_attempts WHERE intent_id = ? AND state IN ('started', 'pending', 'unknown'))`,
    params: [nowMs(), intent.id, intent.id],
  }).expect(1, { code: 'payments.intent.not-open', reason: 'This payment is no longer open.' })
  await releaseParts(unit, intent, parts)
  const refundIds = await holdAndRefund(unit, { ...intent, state: 'unfulfilled' }, parts, paid)
  unit.announce('payments.intent.unfulfilled', { intentId: intent.id, owners: ownersOf(parts) }, { record: ['payments.intent', intent.id] })
  return { refundIds, attempts: paid }
}

/**
 * After the give-back has committed: confirms, as the seller, each refund they hand back themselves.
 * One that cannot be confirmed here (cash with no open session) stays approved on Refunds.
 */
export async function confirmHandBacks(refundIds: string[], attempts: AttemptRow[], by: string): Promise<GivenBack> {
  const out: GivenBack = { handedBack: [], sent: [], unconfirmed: 0 }
  const refunds = await all<{ id: string, attempt_id: string, amount_minor: number }>(
    'SELECT id, attempt_id, amount_minor FROM payments_refunds WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(refundIds))
  for (const refund of refunds) {
    const attempt = attempts.find(a => a.id === refund.attempt_id)!
    if (await refundsItself(attempt)) {
      out.sent.push({ method: attempt.method, amountMinor: refund.amount_minor })
      continue
    }
    const unit = createUnit()
    try {
      await confirmRefund(unit.view(), refund.id, by)
      await unit.commit()
      out.handedBack.push({ method: attempt.method, amountMinor: refund.amount_minor })
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('payments.giveback-confirm-failed', { refundId: refund.id, error: String((error as Error)?.message ?? error) })
      out.unconfirmed++
    }
  }
  return out
}
