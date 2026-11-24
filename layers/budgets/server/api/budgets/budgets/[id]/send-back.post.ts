// Sends a proposed budget back to its author with a note (BC-08).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../budgets'
import { sendBack } from '../../../../changes'

export default defineRoute({ ability: 'budgets.budget.approve', rateLimit: 'write', input: z.object({ note: z.string().trim().min(1).max(300) }) }, async (event, { input, unit }) => { // not-policy: the table's bound
  const budget = await requireBudget(getRouterParam(event, 'id'))
  sendBack(unit, budget, input.note)
  return { budgetId: budget.id }
})
