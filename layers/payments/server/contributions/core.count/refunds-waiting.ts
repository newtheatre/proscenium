// Refunds asked for and waiting for someone to approve them, beside the Refunds entry.
import { can, first, type Actor } from '#kit'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'payments.refund.approve')).allowed) return 0
    return (await first<{ n: number }>("SELECT count(*) AS n FROM payments_refunds WHERE state = 'requested'"))?.n ?? 0
  },
}
