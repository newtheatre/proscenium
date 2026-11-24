// Closes an approved budget (BC-13).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../budgets'
import { close } from '../../../../changes'

export default defineRoute({ ability: 'budgets.budget.approve', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  close(unit, budget)
  return { budgetId: budget.id }
})
