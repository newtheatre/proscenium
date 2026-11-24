// Changing a budget line (BC-07): its name, category or sources; its amount while the budget is a
// draft; or archiving and restoring it. Each part checks itself and adds its column; the columns go
// in one guarded statement, so a clash of names or a budget that changed meanwhile is refused.
import { z } from 'zod'
import { nowMs, refuse, requireAbility, type Actor, type UnitView } from '#kit'
import { requireCategory } from './categories'
import { addAmount, budgetLines, checkSources, setSources, type Budget, type LineKind } from './budgets'

export const lineChange = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound
  categoryId: z.string().max(40), // not-policy: ids are short
  amountMinor: z.number().int().min(0).max(100_000_000), // not-policy: a million pounds, a sanity bound
  sources: z.array(z.string().max(80)).max(20), // not-policy: a sanity bound
  archived: z.boolean(),
}).partial()
type Input = z.infer<typeof lineChange>
type LineRow = { id: string, name: string, kind: LineKind, archivedAt: number | null }
type Columns = { fields: string[], sets: string[], params: unknown[] }

const setColumn = (c: Columns, field: string, column: string, value: unknown) => {
  c.fields.push(field)
  c.sets.push(`${column} = ?`)
  c.params.push(value)
}

async function category(c: Columns, line: LineRow, categoryId: string): Promise<void> {
  if (line.kind !== 'expense') refuse('budgets.line.category', 'Only an expense line has a category.', { status: 422, fields: { categoryId: 'budgets.line.category' } })
  const found = await requireCategory(categoryId)
  if (found.archivedAt) refuse('budgets.line.category', `${found.name} is archived.`, { status: 422, fields: { categoryId: 'budgets.line.category' } })
  setColumn(c, 'category', 'category_id', found.id)
}

async function archive(c: Columns, budget: Budget, line: LineRow, archived: boolean): Promise<void> {
  if (archived && budget.state === 'approved') {
    const figures = (await budgetLines(budget)).lines.find(l => l.id === line.id)?.figures
    if (figures && (figures.actualMinor || figures.committedMinor || figures.pendingMinor))
      refuse('budgets.line.in-use', 'Money has been spent or committed on this line, so it stays.', { status: 409, remedy: 'Revise its amount instead.' })
  }
  setColumn(c, archived ? 'archived' : 'restored', 'archived_at', archived ? nowMs() : null)
}

async function sources(unit: UnitView, c: Columns, line: LineRow, given: string[]): Promise<void> {
  if (line.kind !== 'income') refuse('budgets.line.sources', 'Only an income line reads ledger accounts.', { status: 422, fields: { sources: 'budgets.line.sources' } })
  await checkSources(given)
  setSources(unit, line.id, given)
  c.fields.push('sources')
}

/** Applies a change to one line, auditing the fields that changed. */
export async function changeLine(unit: UnitView, actor: Actor, target: { budget: Budget, line: LineRow }, input: Input): Promise<void> {
  const { budget, line } = target
  if (budget.state === 'proposed' || budget.state === 'closed') refuse('budgets.budget.state', `This budget is ${budget.state}, so its lines cannot change.`, { status: 409 })
  if (budget.state === 'approved') await requireAbility(actor, 'budgets.budget.approve')
  const c: Columns = { fields: [], sets: [], params: [] }
  if (input.name !== undefined && input.name !== line.name) setColumn(c, 'name', 'name', input.name)
  if (input.categoryId !== undefined) await category(c, line, input.categoryId)
  if (input.archived !== undefined && input.archived !== !!line.archivedAt) await archive(c, budget, line, input.archived)
  if (c.sets.length) {
    unit.add({
      sql: `UPDATE OR IGNORE budgets_lines SET ${c.sets.join(', ')}, updated_at = ? WHERE id = ? AND budget_id IN (SELECT id FROM budgets_budgets WHERE state = ?)`,
      params: [...c.params, nowMs(), line.id, budget.state],
    }).expect(1, { code: 'budgets.line.name-taken', reason: 'Another line of this budget already has that name, or the budget changed.', remedy: 'Choose another name, or reload.' })
  }
  if (input.sources !== undefined) await sources(unit, c, line, input.sources)
  if (input.amountMinor !== undefined) {
    if (budget.state !== 'draft') refuse('budgets.line.approved', 'An approved line is revised with a reason.', { status: 409, fields: { amountMinor: 'budgets.line.approved' } })
    addAmount(unit, { lineId: line.id, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'draft', by: actor.accountId ?? null, state: 'draft' })
    c.fields.push('amount')
  }
  if (c.fields.length) unit.audit({ action: 'update', record: ['budgets.line', line.id], detail: { fields: c.fields } })
}
