// Proposes a draft budget for approval (BC-08).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../budgets'
import { propose } from '../../../../changes'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  await propose(unit, budget, actor.accountId!)
  return { budgetId: budget.id }
})
