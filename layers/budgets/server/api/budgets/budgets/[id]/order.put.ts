// Puts a budget's lines in the order they were dragged to (BC-07).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireBudget } from '../../../../budgets'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: z.object({ lineIds: z.array(z.string().max(40)).min(1).max(200) }) }, async (event, { input, unit }) => { // not-policy: a sanity bound
  const budget = await requireBudget(getRouterParam(event, 'id'))
  if (budget.state === 'closed') refuse('budgets.budget.state', 'This budget is closed.', { status: 409 })
  unit.add({
    sql: `UPDATE budgets_lines SET sort_order = (SELECT key + 1 FROM json_each(?1) WHERE value = budgets_lines.id)
          WHERE budget_id = ?2 AND id IN (SELECT value FROM json_each(?1))`,
    params: [JSON.stringify(input.lineIds), budget.id],
  }).expect(new Set(input.lineIds).size, { code: 'budgets.line.unknown', reason: 'One of those lines is not on this budget.', remedy: 'Reload the budget and try again.' })
  unit.audit({ action: 'update', record: ['budgets.budget', budget.id], detail: { fields: ['order'] } })
  return { budgetId: budget.id }
})
