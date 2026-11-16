// Asks providers about attempts still waiting (Box office specification, part 3: "A timeout is not a
// failure"). A final answer is recorded as the provider's. An attempt with no answer inside
// payments.attempts.answer-within becomes unknown: what it holds is kept, staff are alerted, and this
// task keeps asking until the provider answers or a person reconciles it. One attempt's failure stops
// that attempt only.
import { all, defineTask, isRefusal, log, nowMs, useSetting } from '#kit'
import { fitAnswer, recordAnswer, type AttemptRow } from '../answers'
import { forProvider } from '../providers'
import type { ProviderAnswer } from '../points/provider'

const BATCH = 50 // not-policy: attempts asked about per run
const SECOND = 1000 // not-policy: milliseconds in a second

export async function reconcileAttempt(attempt: AttemptRow & { started_at: number }, answerWithin: number): Promise<void> {
  const { provider, attempt: asked } = await forProvider(attempt)
  let answer: ProviderAnswer | 'unknown' = 'unknown'
  if (provider?.status) {
    try {
      answer = await provider.status(asked)
    }
    catch (error) {
      log.warn('payments.status-failed', { attemptId: attempt.id, error: String((error as Error)?.message ?? error) })
    }
  }
  if (answer !== 'unknown' && answer.state !== 'pending') {
    await recordAnswer(attempt.id, fitAnswer(attempt, answer), { kind: 'poll' })
    return
  }
  if (answer !== 'unknown' && attempt.state === 'started') await recordAnswer(attempt.id, answer, { kind: 'poll' })
  if (attempt.state !== 'unknown' && attempt.started_at + answerWithin * SECOND < nowMs()) {
    const fresh = { ...attempt, state: answer !== 'unknown' && attempt.state === 'started' ? 'pending' as const : attempt.state }
    await recordAnswer(fresh.id, { state: 'unknown' }, { kind: 'system' })
  }
}

export default defineTask(async () => {
  const answerWithin = await useSetting('payments.attempts.answer-within') as number
  const waiting = await all<AttemptRow & { started_at: number }>("SELECT * FROM payments_attempts WHERE state IN ('started', 'pending', 'unknown') ORDER BY updated_at LIMIT " + BATCH)
  for (const attempt of waiting) {
    try {
      await reconcileAttempt(attempt, answerWithin)
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('payments.reconcile-failed', { attemptId: attempt.id, error: String((error as Error)?.message ?? error) })
    }
  }
})
