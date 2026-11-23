// Applications waiting on staff for a check or approval (V2, AP2), beside the Members entry and on the console home card.
import { can, first, type Actor } from '#kit'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'membership.membership.view')).allowed) return 0
    return (await first<{ n: number }>("SELECT count(*) AS n FROM membership_memberships WHERE state = 'pending' AND ((needs_verification = 1 AND verified_at IS NULL) OR (needs_approval = 1 AND approved_at IS NULL))"))?.n ?? 0
  },
}
