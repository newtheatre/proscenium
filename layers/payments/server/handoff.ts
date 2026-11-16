// The SumUp app's return from a hand-off (contributions/payments.provider/sumup-handoff.ts). The
// address is signed for one attempt; what the app says becomes that attempt's answer, recorded as a
// person's (the seller's device), with SumUp's transaction code kept for reconciliation.
import { first, Refusal } from '#kit'
import { signing } from '#kit/signing'
import { recordAnswer, type AttemptRow } from './answers'
import { providerAccount } from './providers'
import { HANDOFF_PURPOSE, handoffData } from './contributions/payments.provider/sumup-handoff'

export interface HandoffReturn { status?: string, txCode?: string, foreignTxId?: string }

export async function handoffReturned(attemptId: string, proof: string, back: HandoffReturn): Promise<{ state: string }> {
  const dot = proof.indexOf('.')
  const ok = dot > 0 && await signing.verify(HANDOFF_PURPOSE, proof.slice(0, dot), handoffData(attemptId), proof.slice(dot + 1))
  if (!ok) throw new Refusal('payments.handoff.bad-address', 'This return address is not one this site made.', { status: 403, remedy: 'Record the reader\'s result on the till instead.' })
  const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptId)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if ((await providerAccount(attempt.provider_account_id))?.provider !== 'sumup-handoff') throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (back.foreignTxId && back.foreignTxId !== attemptId) throw new Refusal('payments.handoff.wrong-payment', 'The SumUp app answered for a different payment.', { status: 409 })
  const answer = back.status === 'success'
    ? { state: 'succeeded' as const, providerRef: back.txCode }
    : { state: 'failed' as const, providerRef: back.txCode, failureCode: 'declined' }
  if (['started', 'pending', 'unknown'].includes(attempt.state)) await recordAnswer(attemptId, answer, { kind: 'person' })
  return { state: (await first<{ state: string }>('SELECT state FROM payments_attempts WHERE id = ?', attemptId))!.state }
}
