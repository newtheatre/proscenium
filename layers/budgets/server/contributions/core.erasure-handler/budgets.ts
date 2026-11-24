// Erasure: a person erased stops holding any budget, and their claims that never had a financial
// effect (drafts, withdrawn, declined) lose their words and receipts at once. Approved, paid and
// voided claims are the theatre's financial record and wait for budgets.retention.claims (BC-33).
import type { UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { clearClaims } from '../../sweeps'

const UNPOSTED = "state IN ('draft', 'withdrawn', 'declined')"

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    unit.add({ sql: `DELETE FROM budgets_holders WHERE account_id IN (${accountScopeSql('?1')})`, params: [subject.accountId] })
    clearClaims(unit, { sql: `SELECT id FROM budgets_claims WHERE ${UNPOSTED} AND claimant_id IN (${accountScopeSql('?1')})`, params: [subject.accountId] })
  },
}
