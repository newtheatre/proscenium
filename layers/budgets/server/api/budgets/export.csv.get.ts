// BC-37: budgets of a finance year, or every year, with each line's figures as CSV; audited.
import { setResponseHeader } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { budgetsCsv } from '../../export'

export default defineRoute({ ability: 'budgets.budget.view', rateLimit: 'export', input: z.object({ year: z.iso.date().optional() }) }, async (event, { input, unit }) => {
  const { csv, budgets } = await budgetsCsv(input.year)
  unit.audit({ action: 'read', ability: 'budgets.budget.view', detail: { budgetsExport: budgets, year: input.year ?? null } })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="budgets-${input.year ?? 'all-years'}.csv"`)
  return csv
})
