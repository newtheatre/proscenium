// Approves a proposed budget (BC-08): never by the person who proposed it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../budgets'
import { approve } from '../../../../changes'

export default defineRoute({ ability: 'budgets.budget.approve', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  await approve(unit, budget, actor.accountId!)
  return { budgetId: budget.id }
})
