// What claims hold on a budget's lines, read by the budget's figures and its close guard. Kept apart
// from claims.ts, which reads budgets.ts, so the figures can count claims without an import cycle.
import { all, first } from '#kit'

/** Claims that keep a budget open: submitted or sent back, with an item on one of its lines. */
export async function openClaimsOn(budgetId: string): Promise<number> {
  const row = await first<{ n: number }>(
    `SELECT count(DISTINCT c.id) AS n FROM budgets_claims c JOIN budgets_claim_items i ON i.claim_id = c.id
      WHERE c.state IN ('submitted', 'returned') AND i.line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?)`, budgetId)
  return row?.n ?? 0
}

/** What submitted claims ask of each line of a budget, for its Pending figure (BC-10). */
export async function pendingOn(budgetId: string, exceptClaimId?: string): Promise<Map<string, number>> {
  const rows = await all<{ lineId: string, amountMinor: number }>(
    `SELECT i.line_id AS lineId, sum(coalesce(i.approved_minor, i.amount_minor)) AS amountMinor FROM budgets_claim_items i JOIN budgets_claims c ON c.id = i.claim_id
      WHERE c.state = 'submitted' AND c.id <> ?2 AND i.line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?1) GROUP BY i.line_id`, budgetId, exceptClaimId ?? '') // not-policy: numbered parameters
  return new Map(rows.map(r => [r.lineId, r.amountMinor]))
}
