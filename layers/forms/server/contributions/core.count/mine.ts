// How many forms the person asking has started or sent: My account shows My forms only to somebody with one.
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await first<{ n: number }>(`SELECT count(*) AS n FROM forms_responses WHERE state IN ('draft', 'submitted') AND person_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
  },
}
