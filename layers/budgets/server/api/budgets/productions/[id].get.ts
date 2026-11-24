// A production's Budget tab and fact (BC-11): its budget's totals and lines, income from tickets and
// the bar to date, and whether it is offered for closing; or none, with whether one can be made.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { productionBudget } from '../../../production'

export default defineRoute({ ability: 'budgets.budget.view', rateLimit: 'default' }, async (event, { actor }) => ({
  ...(await productionBudget(getRouterParam(event, 'id') ?? '') ?? { budget: null }),
  canManage: (await can(actor, 'budgets.budget.manage')).allowed,
}))
