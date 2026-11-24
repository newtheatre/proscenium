// Reopens a closed budget with a reason, such as a late bill (BC-13).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../budgets'
import { reopen } from '../../../../changes'

export default defineRoute({ ability: 'budgets.budget.approve', rateLimit: 'write', input: z.object({ note: z.string().trim().min(1).max(300) }) }, async (event, { input, unit }) => { // not-policy: the table's bound
  const budget = await requireBudget(getRouterParam(event, 'id'))
  reopen(unit, budget, input.note)
  return { budgetId: budget.id }
})
