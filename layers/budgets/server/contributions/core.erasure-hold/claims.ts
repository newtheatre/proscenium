// Erasure waits while the theatre owes the person money on an approved claim, or has a claim of
// theirs still to decide (spec part 2, "Merge and erasure").
import { all } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  async holds(accountId: string) {
    const rows = await all<{ state: string }>(
      `SELECT DISTINCT state FROM budgets_claims WHERE claimant_id IN (${accountScopeSql('?1')})
        AND (state IN ('submitted', 'returned') OR (state = 'approved' AND paid_minor < approved_minor))`, accountId)
    const codes: string[] = []
    if (rows.some(r => r.state === 'approved')) codes.push('budgets.unpaid-claim')
    if (rows.some(r => r.state !== 'approved')) codes.push('budgets.open-claim')
    return codes
  },
} satisfies { holds: (accountId: string) => Promise<string[]> }
