// One verified webhook event. The event only says which attempt to ask about: the provider's status
// is the truth, so a repeated event changes nothing and events out of order end in the state the
// provider reports.
import { first, nowMs, defineJob } from '#kit'
import { fitAnswer, recordAnswer, type AttemptRow } from '../answers'
import { forProvider } from '../providers'

export default defineJob<{ webhookEventId: string }>(async (payload, unit) => {
  const event = await first<{ id: string, signature_ok: number, attempt_id: string | null, handled_at: number | null }>('SELECT * FROM payments_webhook_events WHERE id = ?', payload.webhookEventId)
  if (!event || !event.signature_ok || event.handled_at !== null || !event.attempt_id) return
  const attempt = (await first<AttemptRow>('SELECT * FROM payments_attempts WHERE id = ?', event.attempt_id))!
  if (['started', 'pending', 'unknown'].includes(attempt.state)) {
    const { provider, attempt: asked } = await forProvider(attempt)
    const answer = await provider?.status?.(asked)
    // No answer yet: fail the job so the queue asks again later.
    if (!answer || answer === 'unknown') throw new Error(`the provider gave no answer for attempt ${attempt.id}`)
    await recordAnswer(attempt.id, fitAnswer(attempt, answer), { kind: 'webhook', webhookEventId: event.id })
  }
  unit.add({ sql: 'UPDATE payments_webhook_events SET handled_at = ? WHERE id = ? AND handled_at IS NULL', params: [nowMs(), event.id] })
})
