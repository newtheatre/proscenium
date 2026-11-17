// How many current awards the person asking holds: My account shows Awards only to somebody with one.
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await first<{ n: number }>(`SELECT count(*) AS n FROM awards_awards WHERE state = 'current' AND account_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
  },
}
