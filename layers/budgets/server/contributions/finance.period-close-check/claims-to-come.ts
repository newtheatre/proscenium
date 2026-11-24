// Costs still to come (BC-36): claims submitted longer ago than the approver reminder, with items
// spent in the period. A warning only; the treasurer may close the period regardless.
import { first, nowMs, useSetting } from '#kit'
import type { PeriodCloseCheck } from '#modules/finance'

const SECOND = 1000 // not-policy: settings are whole seconds

export default {
  async warnings(period) {
    const after = await useSetting('budgets.reminders.approver-after') as number
    const row = await first<{ n: number }>(
      `SELECT count(DISTINCT c.id) AS n FROM budgets_claims c JOIN budgets_claim_items i ON i.claim_id = c.id
        WHERE c.state IN ('submitted', 'returned') AND c.submitted_at < ? AND i.spent_on >= ? AND i.spent_on <= ?`,
      nowMs() - after * SECOND, period.startsOn, period.endsOn)
    const n = row?.n ?? 0
    if (!n) return []
    return [{
      sentence: n === 1
        ? 'One expense claim with spending in this period has waited a while for a decision. Its costs are not in the ledger yet.'
        : `${n} expense claims with spending in this period have waited a while for a decision. Their costs are not in the ledger yet.`,
      to: '/console/budgets/approvals',
    }]
  },
} satisfies PeriodCloseCheck
