// Creates a draft budget (BC-06): one per production, season, or department and year among budgets
// not closed. The name defaults to what it is for; a general budget names itself.
import { defineRoute, newId, nowMs, refuse } from '#kit'
import { budgetFields, checkParentLine, subjectOf, theatreCurrency } from '../../../budgets'

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', idempotent: true, input: budgetFields.partial({ name: true }) }, async (_event, { input, unit }) => {
  const subject = await subjectOf(input)
  const name = input.name ?? subject.name
  if (!name) refuse('budgets.budget.name', 'Give the budget a name.', { status: 422, fields: { name: 'budgets.budget.name' } })
  const currency = await theatreCurrency()
  await checkParentLine(input.parentLineId, { id: null, currency })
  const id = newId('bgt')
  const at = nowMs()
  unit.add({
    sql: `INSERT OR IGNORE INTO budgets_budgets (id, name, scope, production_id, season_id, department_term_id, year_starts_on, parent_line_id, currency, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    params: [id, name, input.scope, input.scope === 'production' ? input.productionId : null, input.scope === 'season' ? input.seasonId : null,
      input.scope === 'department' ? input.departmentTermId : null, subject.yearStartsOn, input.parentLineId ?? null, currency, at, at],
  }).expect(1, { code: 'budgets.budget.exists', reason: 'There is already an open budget for that.', remedy: 'Open it from the list, or close it first.' })
  unit.audit({ action: 'create', record: ['budgets.budget', id] })
  return { budgetId: id }
})
