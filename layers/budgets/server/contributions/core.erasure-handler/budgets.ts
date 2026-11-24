// Erasure: a person erased stops holding any budget, and their claims that never had a financial
// effect (drafts, withdrawn, declined) lose their words and receipts at once. Approved, paid and
// voided claims are the theatre's financial record and wait for budgets.retention.claims.
import { nowMs, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'

const UNPOSTED = "state IN ('draft', 'withdrawn', 'declined')"

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    unit.add({ sql: `DELETE FROM budgets_holders WHERE account_id IN (${accountScopeSql('?1')})`, params: [subject.accountId] })
    const theirs = `SELECT id FROM budgets_claims WHERE ${UNPOSTED} AND claimant_id IN (${accountScopeSql('?1')})`
    const items = `SELECT id FROM budgets_claim_items WHERE claim_id IN (${theirs})`
    unit.add({
      sql: `UPDATE core_files SET state = 'deleted', deleted_at = ?2, purge_after = ?2 WHERE owner_type = 'budgets.claim-item' AND owner_id IN (${items}) AND state IN ('pending', 'ready', 'rejected')`, // not-policy: numbered parameters
      params: [subject.accountId, nowMs()],
    })
    unit.add({ sql: `UPDATE budgets_claim_events SET note = NULL WHERE note IS NOT NULL AND claim_id IN (${theirs})`, params: [subject.accountId] })
    unit.add({ sql: `UPDATE budgets_claim_items SET description = '', no_receipt_reason = NULL, part_reason = NULL WHERE claim_id IN (${theirs})`, params: [subject.accountId] })
    unit.add({ sql: `UPDATE budgets_claims SET claimant_id = NULL, title = '' WHERE id IN (${theirs})`, params: [subject.accountId] })
  },
}
