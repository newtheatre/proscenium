// Adds a line to a budget (BC-07): an expense line names its category, an income line the ledger
// accounts it reads. In a draft the amount is a draft; on an approved budget it needs the approver
// and a reason, and is approved at once.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, newId, nowMs, refuse, requireAbility } from '#kit'
import { requireCategory } from '../../../../categories'
import { addAmount, checkSources, KINDS, requireBudget, setSources } from '../../../../budgets'

const input = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the table's bound
  kind: z.enum(KINDS),
  categoryId: z.string().max(40).nullable().optional(), // not-policy: ids are short
  amountMinor: z.number().int().min(0).max(100_000_000), // not-policy: a million pounds, a sanity bound
  sources: z.array(z.string().max(80)).max(20).optional(), // not-policy: a sanity bound
  reason: z.string().trim().min(1).max(200).optional(), // not-policy: the table's bound
})

export default defineRoute({ ability: 'budgets.budget.manage', rateLimit: 'write', idempotent: true, input }, async (event, { input, unit, actor }) => {
  const budget = await requireBudget(getRouterParam(event, 'id'))
  if (budget.state === 'proposed' || budget.state === 'closed') refuse('budgets.budget.state', `This budget is ${budget.state}, so its lines cannot change.`, { status: 409 })
  if (budget.state === 'approved') {
    await requireAbility(actor, 'budgets.budget.approve')
    if (!input.reason) refuse('budgets.line.reason', 'Say why the approved budget gains a line.', { status: 422, fields: { reason: 'budgets.line.reason' } })
  }
  let categoryId: string | null = null
  if (input.kind === 'expense') {
    if (!input.categoryId) refuse('budgets.line.category', 'Choose what the money is spent on.', { status: 422, fields: { categoryId: 'budgets.line.category' } })
    const category = await requireCategory(input.categoryId!)
    if (category.archivedAt) refuse('budgets.line.category', `${category.name} is archived.`, { status: 422, fields: { categoryId: 'budgets.line.category' } })
    categoryId = category.id
  }
  const sources = input.kind === 'income' ? input.sources ?? [] : []
  await checkSources(sources)
  const id = newId('bgl')
  const at = nowMs()
  const order = (await first<{ n: number }>('SELECT coalesce(max(sort_order), 0) + 1 AS n FROM budgets_lines WHERE budget_id = ?', budget.id))!.n
  unit.add({
    sql: `INSERT OR IGNORE INTO budgets_lines (id, budget_id, name, kind, category_id, sort_order, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM budgets_budgets WHERE id = ? AND state = ?)`,
    params: [id, budget.id, input.name, input.kind, categoryId, order, at, at, budget.id, budget.state],
  }).expect(1, { code: 'budgets.line.name-taken', reason: `This budget already has a line called ${input.name}.` })
  const reason = budget.state === 'approved' ? input.reason! : null
  addAmount(unit, { lineId: id, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'draft', reason, by: actor.accountId ?? null, state: budget.state, at })
  if (budget.state === 'approved') addAmount(unit, { lineId: id, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'approved', reason, by: actor.accountId ?? null, state: budget.state, at })
  setSources(unit, id, sources)
  unit.audit({ action: 'create', record: ['budgets.line', id] })
  return { lineId: id }
})
