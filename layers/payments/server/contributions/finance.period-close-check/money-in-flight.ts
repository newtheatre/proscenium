// What Payments knows that stops a period being closed: a till session that opened in the period and
// is still open, and money taken in the period that could not be settled and has no refund yet.
import { first } from '#kit'
import type { PeriodCloseCheck } from '#modules/finance'

export default {
  async blockers(period) {
    const out: { sentence: string, to?: string }[] = []
    const sessions = await first<{ n: number }>("SELECT count(*) AS n FROM payments_sessions WHERE state <> 'closed' AND opened_at >= ? AND opened_at < ?", period.startsAt, period.endsAt)
    if (sessions?.n) out.push({ sentence: `${sessions.n === 1 ? 'A till session' : `${sessions.n} till sessions`} opened in this period ${sessions.n === 1 ? 'is' : 'are'} still open.`, to: '/console/payments/sessions' })
    const unfulfilled = await first<{ n: number }>(`SELECT count(*) AS n FROM payments_intents i WHERE i.state = 'unfulfilled' AND i.settled_at IS NULL AND i.created_at >= ? AND i.created_at < ?
      AND NOT EXISTS (SELECT 1 FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = i.id AND r.state <> 'declined')`, period.startsAt, period.endsAt)
    if (unfulfilled?.n) out.push({ sentence: `${unfulfilled.n === 1 ? 'A payment' : `${unfulfilled.n} payments`} could not be completed and ${unfulfilled.n === 1 ? 'has' : 'have'} no refund yet.`, to: '/console/payments/attention' })
    return out
  },
} satisfies PeriodCloseCheck
