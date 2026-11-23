// What Needs attention holds, beside its menu entry: payments with no answer, payments to return and
// refunds the provider turned down, and till sessions awaiting their count. Nought for anyone who cannot settle them.
import { can, first, type Actor } from '#kit'
import { BEING_RETURNED } from '../../keep'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'payments.attempt.reconcile')).allowed) return 0
    const row = await first<{ n: number }>(`SELECT
      (SELECT count(*) FROM payments_attempts WHERE state = 'unknown')
      + (SELECT count(*) FROM payments_intents i WHERE ${BEING_RETURNED})
      + (SELECT count(*) FROM payments_refunds WHERE state = 'failed')
      + (SELECT count(*) FROM payments_sessions WHERE state = 'counting') AS n`)
    return row?.n ?? 0
  },
}
