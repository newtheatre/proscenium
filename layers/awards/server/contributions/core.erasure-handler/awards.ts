// Erasure: the person's awards leave the roll of honour in the erasure's own batch. The registry
// blanks the printed name and the citation; this hides the row so a blank is never listed.
import { nowMs, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    unit.add({
      sql: `UPDATE awards_awards SET visibility = 'hidden', updated_at = ?1 WHERE account_id IN (${accountScopeSql('?2')})`,
      params: [nowMs(), subject.accountId],
    })
  },
}
