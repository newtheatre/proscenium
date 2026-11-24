// Stops somebody holding this budget (BC-14): their grant on it ends now.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { endGrantOn } from '#modules/core'
import { requireBudget } from '../../../../../budgets'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  const grantId = getRouterParam(event, 'grantId') ?? ''
  await endGrantOn(unit, actor, grantId, ['budgets.budget', budget.id])
  return { grantId }
})
