// What Needs attention holds, beside its menu entry: payments with no answer, payments to return and
// refunds the provider turned down. Nought for anyone who cannot settle them.
import { can, first, type Actor } from '#kit'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'payments.attempt.reconcile')).allowed) return 0
    const row = await first<{ n: number }>(`SELECT
      (SELECT count(*) FROM payments_attempts WHERE state = 'unknown')
      + (SELECT count(*) FROM payments_intents i WHERE i.state = 'unfulfilled' AND NOT EXISTS (SELECT 1 FROM payments_refunds r JOIN payments_intent_parts p ON p.id = r.part_id WHERE p.intent_id = i.id AND r.state = 'succeeded'))
      + (SELECT count(*) FROM payments_refunds WHERE state = 'failed') AS n`)
    return row?.n ?? 0
  },
}
