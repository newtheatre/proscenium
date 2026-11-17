// The SumUp app's return from a hand-off (contributions/payments.provider/sumup-handoff.ts). The
// address is signed for one attempt; what the app says becomes that attempt's answer, recorded as a
// person's (the seller's device), with SumUp's transaction code kept for reconciliation.
import { first, Refusal } from '#kit'
import { signing } from '#kit/signing'
import { recordAnswer, type AttemptRow } from './answers'
import { providerAccount } from './providers'
import { RETURN_PATH } from './start'
import { decodeReturn, HANDOFF_PURPOSE, handoffData } from './contributions/payments.provider/sumup-handoff'

export interface HandoffReturn { status?: string, txCode?: string, foreignTxId?: string }

/**
 * Records what the app said and answers with the attempt's state, its payment, and the screen the
 * till asked to come back to, when the proof names one (keyId.signature, or keyId.signature.screen).
 */
export async function handoffReturned(attemptId: string, proof: string, back: HandoffReturn): Promise<{ state: string, intentId: string, returnTo: string | null }> {
  const [keyId, signature, screen, ...extra] = proof.split('.')
  const returnTo = screen === undefined ? undefined : decodeReturn(screen)
  const wellFormed = !!keyId && !!signature && !extra.length && returnTo !== null && (returnTo === undefined || RETURN_PATH.test(returnTo))
  const ok = wellFormed && await signing.verify(HANDOFF_PURPOSE, keyId, handoffData(attemptId, returnTo ?? undefined), signature)
  if (!ok) throw new Refusal('payments.handoff.bad-address', 'This return address is not one this site made.', { status: 403, remedy: 'Record the reader\'s result on the till instead.' })
  const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptId)
  if (!attempt) throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if ((await providerAccount(attempt.provider_account_id))?.provider !== 'sumup-handoff') throw new Refusal('core.not-found', 'There is no such payment attempt.', { status: 404 })
  if (back.foreignTxId && back.foreignTxId !== attemptId) throw new Refusal('payments.handoff.wrong-payment', 'The SumUp app answered for a different payment.', { status: 409 })
  const answer = back.status === 'success'
    ? { state: 'succeeded' as const, providerRef: back.txCode }
    : { state: 'failed' as const, providerRef: back.txCode, failureCode: 'declined' }
  if (['started', 'pending', 'unknown'].includes(attempt.state)) await recordAnswer(attemptId, answer, { kind: 'person' })
  const now = (await first<{ state: string, intent_id: string }>('SELECT state, intent_id FROM payments_attempts WHERE id = ?', attemptId))!
  return { state: now.state, intentId: now.intent_id, returnTo: returnTo ?? null }
}
