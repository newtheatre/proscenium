// The outcome of asking a provider to start a payment. The call happening is all this records: the
// provider's reference, kept on the attempt. What the payment came to is an answer, recorded by
// startAttempt or by the reconcile task, so it is settled in one place.
//
// In practice nothing reaches a provider (O1): the call waits for the trainee, and what they answer
// on the practice card reader is the reader's answer, recorded as a provider's would be (PAY-10).
import { defineCall, first, useContext } from '#kit'
import { forProvider } from '../providers'
import { applyAnswer, type AttemptRow } from '../answers'

const attemptOf = (reference: string) => reference.slice(reference.indexOf(':') + 1)

export default defineCall({
  async outcome(unit, outcome, call) {
    if (outcome.providerReference)
      unit.add({ sql: 'UPDATE payments_attempts SET provider_ref = coalesce(provider_ref, ?) WHERE id = ?', params: [outcome.providerReference, attemptOf(call.reference)] })
    if (!useContext().practice) return
    const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptOf(call.reference))
    if (!attempt) return
    const said = outcome.result === 'succeeded' ? { state: 'succeeded' as const } : { state: 'failed' as const, failureCode: String(outcome.data?.reason ?? 'declined') }
    await applyAnswer(unit, attempt, said, { kind: 'poll' })
  },
  async reconcile(call) {
    const attempt = await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', attemptOf(call.reference))
    if (!attempt) return { result: 'failed' }
    if (attempt.state !== 'started') return { result: 'succeeded', providerReference: attempt.provider_ref ?? undefined }
    const { provider, attempt: asked } = await forProvider(attempt)
    try {
      const answer = await provider?.status?.(asked)
      if (!answer || answer === 'unknown') return 'unknown'
      return { result: 'succeeded', providerReference: answer.providerRef }
    }
    catch {
      return 'unknown'
    }
  },
  practice: () => 'ask-trainee',
})
