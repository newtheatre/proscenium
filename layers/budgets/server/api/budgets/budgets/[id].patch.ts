// Renames a budget, or changes the line it is funded from while it is not yet approved.
import { getRouterParam } from 'h3'
import { defineRoute, nowMs, refuse } from '#kit'
import { budgetFields, changed, checkParentLine, requireBudget } from '../../../budgets'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input: budgetFields.pick({ name: true, parentLineId: true }).partial() }, async (event, { input, unit }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  if (budget.state === 'closed') refuse('budgets.budget.state', 'This budget is closed.', { status: 409 })
  const fields: string[] = []
  const params: unknown[] = []
  if (input.name !== undefined && input.name !== budget.name) {
    fields.push('name')
    params.push(input.name)
  }
  if (input.parentLineId !== undefined && input.parentLineId !== budget.parentLineId) {
    if (budget.state === 'approved') refuse('budgets.budget.state', 'An approved budget keeps the line it is funded from.', { status: 409, fields: { parentLineId: 'budgets.budget.state' } })
    await checkParentLine(input.parentLineId, budget)
    fields.push('parent_line_id')
    params.push(input.parentLineId)
  }
  if (!fields.length) return { budgetId: budget.id }
  unit.add({ sql: `UPDATE budgets_budgets SET ${fields.map(f => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND state = ?`, params: [...params, nowMs(), budget.id, budget.state] }).expect(1, changed())
  unit.audit({ action: 'update', record: ['budgets.budget', budget.id], detail: { fields } })
  return { budgetId: budget.id }
})
