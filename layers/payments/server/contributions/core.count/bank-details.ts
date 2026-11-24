// Whether the person asking has bank details saved: My account shows them only to somebody who has.
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await first<{ n: number }>(`SELECT count(*) AS n FROM payments_payees WHERE last_digits IS NOT NULL AND account_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
  },
}
