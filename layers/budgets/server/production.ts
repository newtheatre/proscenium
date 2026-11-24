// A production's budget as its page shows it (BC-11), and when a budget is offered for closing
// (BC-13): `budgets.close.after` past the production's last performance.
import { all, first, nowMs, useSetting } from '#kit'
import { budgetLines, getBudget, totalsOf, type Budget } from './budgets'

const SECOND = 1000 // not-policy: settings are whole seconds

/** Approved, with its production's last performance more than `budgets.close.after` ago. */
export async function closeDue(budget: Budget): Promise<boolean> {
  if (budget.state !== 'approved' || !budget.productionId) return false
  const row = await first<{ lastEndsAt: number | null }>('SELECT last_ends_at AS lastEndsAt FROM core_productions WHERE id = ?', budget.productionId)
  if (!row?.lastEndsAt) return false
  const after = await useSetting('budgets.close.after') as number
  return row.lastEndsAt + after * SECOND <= nowMs()
}

/** The production's open budget, or its newest closed one; null when it has none. */
export async function productionBudget(productionId: string) {
  const [row] = await all<{ id: string }>(
    "SELECT id FROM budgets_budgets WHERE production_id = ? ORDER BY state = 'closed', created_at DESC LIMIT 1", productionId)
  const budget = await getBudget(row?.id)
  if (!budget) return null
  const { lines } = await budgetLines(budget)
  return {
    budget,
    lines: lines.filter(l => !l.archivedAt).map(l => ({ id: l.id, name: l.name, kind: l.kind, figures: l.figures })),
    totals: totalsOf(lines),
    closeDue: await closeDue(budget),
  }
}
