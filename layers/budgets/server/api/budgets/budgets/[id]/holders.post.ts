// Makes somebody a holder of this budget (BC-14): the Budget holder role, given on this budget only,
// ending at the role's own end like any grant. Core's rules hold: not oneself, and only what one holds.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { giveRoleOn } from '#modules/core'
import { requireBudget } from '../../../../budgets'
import { HOLDER_ROLE } from '../../../../holders'

export default defineRoute({
  ability: 'budgets.budget.manage',
  rateLimit: 'write',
  input: z.object({ accountId: z.string().max(40) }).strict(), // not-policy: ids are short
}, async (event, { input, unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  const given = await giveRoleOn(unit, actor, { accountId: input.accountId, roleKey: HOLDER_ROLE, record: ['budgets.budget', budget.id] })
  return { grantId: given.id, expiresAt: given.expiresAt }
})
