// How many companies the person asking is a live contact of: My account shows Your companies only to them.
import { first, type Actor } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async value(actor: Actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await first<{ n: number }>(`SELECT count(*) AS n FROM companies_contacts k JOIN companies_companies c ON c.id = k.company_id
      WHERE k.ended_at IS NULL AND c.archived_at IS NULL AND k.account_id IN (${accountScopeSql('?1')})`, actor.accountId))?.n ?? 0
  },
}
