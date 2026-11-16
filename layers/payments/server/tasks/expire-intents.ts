// The backstop for a sale prepared and never paid: an open intent past its expiry, with no attempt
// still waiting for an answer, expires and every part is released. One unit per intent, so one
// failure stops one intent and not the run.
import { all, createUnit, defineTask, isRefusal, log, nowMs } from '#kit'
import { getIntent, ownersOf, partsOf, releaseParts } from '../intents'
import { holdAndRefund, type AttemptRow } from '../answers'

const BATCH = 50 // not-policy: intents expired per run

export async function expireIntent(id: string): Promise<void> {
  const intent = await getIntent(id)
  if (!intent || intent.state !== 'open' || intent.expires_at >= nowMs()) return
  const parts = await partsOf(id)
  const unit = createUnit()
  const view = unit.view()
  const at = nowMs()
  view.add({
    sql: `UPDATE payments_intents SET state = 'expired', updated_at = ? WHERE id = ? AND state = 'open' AND expires_at < ?
      AND NOT EXISTS (SELECT 1 FROM payments_attempts WHERE intent_id = ? AND state IN ('started', 'pending', 'unknown'))`,
    params: [at, id, at, id],
  }).expect(1, { code: 'payments.intent.not-expired', reason: 'This payment is not due to expire.' })
  await releaseParts(view, intent, parts)
  // Part of a desk payment taken before the sale was left: it goes back.
  const paid = await all<AttemptRow>("SELECT * FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded' ORDER BY started_at", id)
  if (paid.length) await holdAndRefund(view, { ...intent, state: 'expired' }, parts, paid)
  view.announce('payments.intent.expired', { intentId: id, owners: ownersOf(parts) }, { record: ['payments.intent', id] })
  await unit.commit()
}

export default defineTask(async () => {
  const due = await all<{ id: string }>(`SELECT i.id FROM payments_intents i WHERE i.state = 'open' AND i.expires_at < ?
    AND NOT EXISTS (SELECT 1 FROM payments_attempts a WHERE a.intent_id = i.id AND a.state IN ('started', 'pending', 'unknown'))
    ORDER BY i.expires_at LIMIT ${BATCH}`, nowMs())
  for (const { id } of due) {
    try {
      await expireIntent(id)
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('payments.expire-failed', { intentId: id, error: String((error as Error)?.message ?? error) })
    }
  }
})
