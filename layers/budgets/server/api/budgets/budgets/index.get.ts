// The Budgets list (BC-10): every budget of a finance year with its totals, and the years to choose from.
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { budgetYears, listBudgets } from '../../../budgets'

export default defineRoute({ ability: 'budgets.budget.view', rateLimit: 'default', input: z.object({ year: z.iso.date().optional() }) }, async (_event, { input, actor }) => {
  const years = await budgetYears()
  const year = input.year ?? years.current
  return {
    year,
    years: years.years,
    budgets: await listBudgets({ yearStartsOn: year }),
    canManage: (await can(actor, 'budgets.budget.manage')).allowed,
  }
})
