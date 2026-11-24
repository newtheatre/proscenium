// Changes a line (BC-07): its name, category or sources; its amount while the budget is a draft; or
// archives and restores it. An approved budget's lines change only with the approver.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requireLine } from '../../../budgets'
import { changeLine, lineChange } from '../../../line-change'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: lineChange }, async (event, { input, unit, actor }) => {
  const target = await requireLine(getRouterParam(event, 'id'))
  await changeLine(unit, actor, target, input)
  return { lineId: target.line.id }
})
