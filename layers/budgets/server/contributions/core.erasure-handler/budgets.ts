// Erasure: a person erased stops holding any budget. Their rows go, rather than an anonymised holder
// that would still count; who added a holder is an actor id, which the account's own erasure covers.
import type { UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    unit.add({ sql: `DELETE FROM budgets_holders WHERE account_id IN (${accountScopeSql('?1')})`, params: [subject.accountId] })
  },
}
