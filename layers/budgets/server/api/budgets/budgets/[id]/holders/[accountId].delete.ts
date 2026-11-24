// Stops somebody holding this budget (BC-14), from their next request.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { requireBudget } from '../../../../../budgets'
import { removeHolder } from '../../../../../holders'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  const accountId = getRouterParam(event, 'accountId') ?? ''
  await removeHolder(unit, budget.id, accountId)
  return { accountId }
})
