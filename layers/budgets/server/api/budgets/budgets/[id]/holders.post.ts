// Names somebody as a holder of this budget (BC-14). Holding is a fact read at each request, so
// nothing has to end when they stop: removing them is enough.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requireBudget } from '../../../../budgets'
import { addHolder } from '../../../../holders'

export default defineRoute({
  ability: 'budgets.budget.manage',
  rateLimit: 'write',
  input: z.object({ accountId: z.string().max(40) }).strict(), // not-policy: ids are short
}, async (event, { input, unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  if (budget.state === 'closed') refuse('budgets.budget.state', 'This budget is closed.', { status: 409 })
  await addHolder(unit, actor, budget.id, input.accountId)
  return { accountId: input.accountId }
})
