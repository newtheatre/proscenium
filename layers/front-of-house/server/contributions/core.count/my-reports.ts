// How many incidents the person has reported, beside My reports in the members' area. The entry is
// named with hideEmpty, so it shows only to someone who has reported one (FH-8).
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    const row = await first<{ n: number }>(`SELECT count(*) AS n FROM front_of_house_incidents WHERE reported_by IN (${accountScopeSql('?1')})`, actor.accountId)
    return row?.n ?? 0
  },
}
