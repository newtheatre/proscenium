// How many forms the person asking has started or sent, and how many reviews they are asked for:
// My account shows My forms only to somebody with one of either.
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    const own = (await first<{ n: number }>(`SELECT count(*) AS n FROM forms_responses WHERE state IN ('draft', 'submitted') AND person_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
    const asked = (await first<{ n: number }>(`SELECT count(*) AS n FROM forms_review_assignments a JOIN forms_review_rounds r ON r.id = a.round_id WHERE a.status <> 'conflicted' AND r.closed_at IS NULL AND a.reviewer_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
    return own + asked
  },
}
