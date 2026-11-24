// The budget's life (spec part 3, "The budget"): draft, proposed, approved, closed. Every change is one
// unit with the state on the statement, so of two people acting at once one wins and one is refused.
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { addAmount, budgetLines, changed, lineFloor, totalsOf, type Budget } from './budgets'
import { openOn } from './requests'
import { openClaimsOn } from './pending'

const LINE_AMOUNT = "coalesce((SELECT a.amount_minor FROM budgets_line_amounts a WHERE a.line_id = l.id AND a.stage = 'draft' ORDER BY a.set_at DESC, a.rowid DESC LIMIT 1), 0)"

function wrongState(budget: Budget, wanted: string): never {
  return refuse('budgets.budget.state', `This budget is ${budget.state}; it needs to be ${wanted}.`, { status: 409 })
}

/** Draft to proposed: at least one line with an amount. */
export async function propose(unit: UnitView, budget: Budget, by: string): Promise<void> {
  if (budget.state !== 'draft') wrongState(budget, 'a draft')
  const any = await first(`SELECT 1 FROM budgets_lines l WHERE l.budget_id = ? AND l.archived_at IS NULL AND ${LINE_AMOUNT} > 0`, budget.id)
  if (!any) refuse('budgets.budget.empty', 'Give at least one line an amount before proposing the budget.', { status: 422 })
  unit.add({ sql: "UPDATE budgets_budgets SET state = 'proposed', proposed_by = ?, note = NULL, updated_at = ? WHERE id = ? AND state = 'draft'", params: [by, nowMs(), budget.id] }).expect(1, changed())
  unit.audit({ action: 'state', record: ['budgets.budget', budget.id], detail: { from: 'draft', to: 'proposed' } })
}

/** Proposed back to draft, with a note for its author: "too much on set". */
export function sendBack(unit: UnitView, budget: Budget, note: string): void {
  if (budget.state !== 'proposed') wrongState(budget, 'proposed')
  unit.add({ sql: "UPDATE budgets_budgets SET state = 'draft', note = ?, updated_at = ? WHERE id = ? AND state = 'proposed'", params: [note, nowMs(), budget.id] }).expect(1, changed())
  unit.audit({ action: 'state', record: ['budgets.budget', budget.id], detail: { from: 'proposed', to: 'draft' } })
}

/** Proposed to approved, by someone other than its proposer; each line's newest draft amount becomes its first approved one. */
export async function approve(unit: UnitView, budget: Budget, by: string): Promise<void> {
  if (budget.state !== 'proposed') wrongState(budget, 'proposed')
  const own = budget.proposedBy && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, budget.proposedBy, by)
  if (own) refuse('budgets.budget.own-proposal', 'You proposed this budget, so someone else approves it.', { status: 403, remedy: 'Ask another treasurer to approve it.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE budgets_budgets SET state = 'approved', approved_by = ?1, approved_at = ?2, note = NULL, updated_at = ?2
          WHERE id = ?3 AND state = 'proposed' AND (proposed_by IS NULL OR proposed_by NOT IN (${accountScopeSql('?1')}))`, // not-policy: numbered parameters
    params: [by, at, budget.id],
  }).expect(1, changed())
  const lines = await all<{ id: string, amount: number }>(`SELECT l.id, ${LINE_AMOUNT} AS amount FROM budgets_lines l WHERE l.budget_id = ? AND l.archived_at IS NULL`, budget.id)
  if (lines.length) {
    unit.add({
      sql: `INSERT INTO budgets_line_amounts (id, line_id, amount_minor, stage, reason, set_by, set_at)
            SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), 'approved', NULL, ?, ? FROM json_each(?)`,
      params: [by, at, JSON.stringify(lines.map(l => [newId('bga'), l.id, l.amount]))],
    }).expect(lines.length, changed())
  }
  unit.audit({ action: 'state', record: ['budgets.budget', budget.id], detail: { from: 'proposed', to: 'approved' } })
  const totalMinor = (await all<{ amount: number }>(`SELECT ${LINE_AMOUNT} AS amount FROM budgets_lines l WHERE l.budget_id = ? AND l.archived_at IS NULL AND l.kind = 'expense'`, budget.id)).reduce((n, r) => n + r.amount, 0)
  unit.announce('budgets.budget.approved', {
    budgetId: budget.id, scope: budget.scope, totalMinor, currency: budget.currency, ...(budget.productionId ? { productionId: budget.productionId } : {}),
  }, { record: ['budgets.budget', budget.id] })
}

/**
 * An approved line's amount changed, with a reason: a new approved row beside the old (BC-09). Below
 * spent plus committed it needs `confirm`, and the refusal says by how much.
 */
export async function revise(unit: UnitView, budget: Budget, input: { lineId: string, amountMinor: number, reason: string, confirm?: boolean, by: string }): Promise<void> {
  if (budget.state !== 'approved') wrongState(budget, 'approved')
  const floor = await lineFloor(budget, input.lineId)
  if (input.amountMinor < floor && !input.confirm)
    refuse('budgets.line.below-spent', 'That is less than this line has already spent and committed.', { status: 409, detail: { floorMinor: String(floor) }, remedy: 'Confirm to set it anyway.' })
  addAmount(unit, { lineId: input.lineId, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'draft', reason: input.reason, by: input.by, state: 'approved' })
  addAmount(unit, { lineId: input.lineId, budgetId: budget.id, amountMinor: input.amountMinor, stage: 'approved', reason: input.reason, by: input.by, state: 'approved' })
  unit.audit({ action: 'update', record: ['budgets.line', input.lineId], detail: { fields: ['amount'], below: input.amountMinor < floor } })
}

/** Approved to closed, once no request on it is waiting or approved and no claim on it waits. Awards will add theirs. */
export async function close(unit: UnitView, budget: Budget): Promise<void> {
  if (budget.state !== 'approved') wrongState(budget, 'approved')
  const open = await openOn(budget.id)
  if (open) refuse('budgets.budget.open-requests', 'Requests on this budget are still waiting or approved.', { status: 409, detail: { requests: String(open) }, remedy: 'Decide or withdraw them first.' })
  const claims = await openClaimsOn(budget.id)
  if (claims) refuse('budgets.budget.open-claims', 'Claims on this budget are still waiting to be decided.', { status: 409, detail: { claims: String(claims) }, remedy: 'Decide them, or ask their claimants to withdraw them.' })
  const at = nowMs()
  unit.add({ sql: "UPDATE budgets_budgets SET state = 'closed', closed_at = ?, updated_at = ? WHERE id = ? AND state = 'approved'", params: [at, at, budget.id] }).expect(1, changed())
  unit.audit({ action: 'state', record: ['budgets.budget', budget.id], detail: { from: 'approved', to: 'closed' } })
  unit.announce('budgets.budget.closed', { budgetId: budget.id }, { record: ['budgets.budget', budget.id] })
}

/** Closed back to approved, with a reason: a late bill. Refused if another live budget took its place. */
export function reopen(unit: UnitView, budget: Budget, note: string): void {
  if (budget.state !== 'closed') wrongState(budget, 'closed')
  unit.add({ sql: "UPDATE OR IGNORE budgets_budgets SET state = 'approved', closed_at = NULL, note = ?, updated_at = ? WHERE id = ? AND state = 'closed'", params: [note, nowMs(), budget.id] })
    .expect(1, { code: 'budgets.budget.taken', reason: 'Another budget is open for the same production, season or department and year.', remedy: 'Close that one first.' })
  unit.audit({ action: 'state', record: ['budgets.budget', budget.id], detail: { from: 'closed', to: 'approved' } })
}

/** The budget with its lines, figures, totals and what it funds: the Budget page. */
export async function budgetView(budget: Budget) {
  const { lines, subBudgets } = await budgetLines(budget)
  const parent = budget.parentLineId
    ? await first<{ lineId: string, lineName: string, budgetId: string, budgetName: string }>('SELECT l.id AS lineId, l.name AS lineName, b.id AS budgetId, b.name AS budgetName FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id WHERE l.id = ?', budget.parentLineId)
    : null
  const history = await all<{ lineId: string, amountMinor: number, stage: string, reason: string | null, setBy: string | null, setAt: number }>(
    `SELECT a.line_id AS lineId, a.amount_minor AS amountMinor, a.stage, a.reason, a.set_by AS setBy, a.set_at AS setAt FROM budgets_line_amounts a
      WHERE a.line_id IN (SELECT id FROM budgets_lines WHERE budget_id = ?) AND a.stage = 'approved' ORDER BY a.set_at, a.rowid`, budget.id)
  return { budget, lines, subBudgets, parent, totals: totalsOf(lines), history }
}
