// Changes a line (BC-07): its name, category or sources; its amount while the budget is a draft; or
// archives and restores it. An approved budget's lines change only with the approver, and one with
// spending or commitments on it is not archived.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse, requireAbility } from '#kit'
import { requireCategory } from '../../../categories'
import { addAmount, budgetLines, checkSources, requireLine, setSources } from '../../../budgets'

const input = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound
  categoryId: z.string().max(40), // not-policy: ids are short
  amountMinor: z.number().int().min(0).max(100_000_000), // not-policy: a million pounds, a sanity bound
  sources: z.array(z.string().max(80)).max(20), // not-policy: a sanity bound
  archived: z.boolean(),
}).partial()

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', input }, async (event, { input, unit, actor }) => {
  const { budget, line } = await requireLine(getRouterParam(event, 'id'))
  if (budget.state === 'proposed' || budget.state === 'closed') refuse('budgets.budget.state', `This budget is ${budget.state}, so its lines cannot change.`, { status: 409 })
  if (budget.state === 'approved') await requireAbility(actor, 'budgets.budget.approve')
  const fields: string[] = []
  const sets: string[] = []
  const params: unknown[] = []
  const set = (field: string, column: string, value: unknown) => {
    fields.push(field)
    sets.push(`${column} = ?`)
    params.push(value)
  }
  if (input.name !== undefined && input.name !== line.name) set('name', 'name', input.name)
  if (input.categoryId !== undefined) {
    if (line.kind !== 'expense') refuse('budgets.line.category', 'Only an expense line has a category.', { status: 422, fields: { categoryId: 'budgets.line.category' } })
    const category = await requireCategory(input.categoryId)
    if (category.archivedAt) refuse('budgets.line.category', `${category.name} is archived.`, { status: 422, fields: { categoryId: 'budgets.line.category' } })
    set('category', 'category_id', category.id)
  }
  if (input.archived !== undefined && input.archived !== !!line.archivedAt) {
    if (input.archived && budget.state === 'approved') {
      const figures = (await budgetLines(budget)).lines.find(l => l.id === line.id)?.figures
      if (figures && (figures.actualMinor || figures.committedMinor || figures.pendingMinor))
        refuse('budgets.line.in-use', 'Money has been spent or committed on this line, so it stays.', { status: 409, remedy: 'Revise its amount instead.' })
    }
    set(input.archived ? 'archived' : 'restored', 'archived_at', input.archived ? nowMs() : null)
  }
  if (sets.length) {
    unit.add({
      sql: `UPDATE OR IGNORE budgets_lines SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND budget_id IN (SELECT id FROM budgets_budgets WHERE state = ?)`,
      params: [...params, nowMs(), line.id, budget.state],
    }).expect(1, { code: 'budgets.line.name-taken', reason: 'Another line of this budget already has that name, or the budget changed.', remedy: 'Choose another name, or reload.' })
  }
  if (input.sources !== undefined) {
    if (line.kind !== 'income') refuse('budgets.line.sources', 'Only an income line reads ledger accounts.', { status: 422, fields: { sources: 'budgets.line.sources' } })
    await checkSources(input.sources)
    setSources(unit, line.id, input.sources)
    fields.push('sources')
  }
  if (input.amountMinor !== undefined) {
    if (budget.state !== 'draft') refuse('budgets.line.approved', 'An approved line is revised with a reason.', { status: 409, fields: { amountMinor: 'budgets.line.approved' } })
    addAmount(unit, { lineId: line.id, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'draft', by: actor.accountId ?? null, state: 'draft' })
    fields.push('amount')
  }
  if (!fields.length) return { lineId: line.id }
  unit.audit({ action: 'update', record: ['budgets.line', line.id], detail: { fields } })
  return { lineId: line.id }
})
