// The daily claims task and the over-budget notice: undecided claims and requests are chased, claims
// past budgets.retention.claims are anonymised (BC-33), and a line that goes over budget is told once (BC-34).
import { all, nowMs, useSetting, type UnitView } from '#kit'
import { accountLabel, holdersOf, notify } from '#modules/core'
import { budgetLines, getBudget, type Budget } from './budgets'
import { approversOf, COLUMNS as CLAIM_COLUMNS, itemsOf, type Claim } from './claims'
import { formatMoney } from './money'
import { COLUMNS as REQUEST_COLUMNS, FROM as REQUEST_FROM, type Request } from './requests'

const SECOND = 1000 // not-policy: settings are whole seconds
const FINAL = "('draft', 'withdrawn', 'declined', 'paid', 'voided')"

/**
 * Anonymises the claims `ids` selects, in one unit: the claimant and every word go, receipts are
 * deleted; amounts, lines and postings stay. `ids` numbers its parameters from ?1.
 */
export function clearClaims(unit: UnitView, ids: { sql: string, params: unknown[] }): void {
  const at = `?${ids.params.length + 1}`
  const items = `SELECT id FROM budgets_claim_items WHERE claim_id IN (${ids.sql})`
  unit.add({
    sql: `UPDATE core_files SET state = 'deleted', deleted_at = ${at}, purge_after = ${at} WHERE owner_type = 'budgets.claim-item' AND owner_id IN (${items}) AND state IN ('pending', 'ready', 'rejected')`,
    params: [...ids.params, nowMs()],
  })
  unit.add({ sql: `UPDATE budgets_claim_events SET note = NULL WHERE note IS NOT NULL AND claim_id IN (${ids.sql})`, params: ids.params })
  unit.add({ sql: `UPDATE budgets_claim_items SET description = '', no_receipt_reason = NULL, part_reason = NULL WHERE claim_id IN (${ids.sql})`, params: ids.params })
  unit.add({ sql: `UPDATE budgets_claims SET claimant_id = NULL, title = '' WHERE id IN (${ids.sql})`, params: ids.params })
}

/** Claims settled one way or another and untouched for the retention period lose their person and words (BC-33). */
export async function sweepRetention(unit: UnitView): Promise<void> {
  const keep = await useSetting('budgets.retention.claims') as number
  clearClaims(unit, {
    sql: `SELECT id FROM budgets_claims WHERE state IN ${FINAL} AND updated_at < ?1 AND (claimant_id IS NOT NULL OR title <> '')`,
    params: [nowMs() - keep * SECOND],
  })
}

/** Claims and requests undecided for budgets.reminders.approver-after are put to their approvers again. */
export async function chaseApprovers(unit: UnitView): Promise<void> {
  const at = nowMs()
  const cutoff = at - (await useSetting('budgets.reminders.approver-after') as number) * SECOND
  const claims = await all<Claim>(`SELECT ${CLAIM_COLUMNS} FROM budgets_claims c WHERE c.state = 'submitted' AND coalesce(c.chased_at, c.submitted_at) < ? ORDER BY c.submitted_at`, cutoff)
  for (const claim of claims) {
    const to = await claimApprovers(claim)
    unit.add({ sql: "UPDATE budgets_claims SET chased_at = ? WHERE id = ? AND state = 'submitted'", params: [at, claim.id] })
    if (!to.length) continue
    await notify(unit, 'budgets.claim-to-approve', {
      to,
      variables: { person: claim.claimantId ? await accountLabel(claim.claimantId) : '', amount: await formatMoney(claim.totalMinor, claim.currency), number: claim.number ?? '', title: claim.title, link: `/console/budgets/claims/${claim.id}` },
      subject: ['budgets.claim', claim.id],
    })
  }
  const requests = await all<Request>(`SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.state = 'requested' AND coalesce(r.chased_at, r.created_at) < ? ORDER BY r.created_at`, cutoff)
  for (const request of requests) {
    const to = (await holdersOf('budgets.budget.hold', ['budgets.budget', request.budgetId])).filter(id => id !== request.requestedBy)
    unit.add({ sql: "UPDATE budgets_spending_requests SET chased_at = ? WHERE id = ? AND state = 'requested'", params: [at, request.id] })
    if (!to.length) continue
    await notify(unit, 'budgets.request-to-approve', {
      to,
      variables: { person: request.requestedBy ? await accountLabel(request.requestedBy) : '', amount: await formatMoney(request.amountMinor, request.currency), line: request.lineName, budget: request.budgetName, link: '/console/budgets/approvals' },
      subject: ['budgets.request', request.id],
    })
  }
}

/** Who a submitted claim waits on: its second approvers once a first approval is in, else its lines' holders. */
async function claimApprovers(claim: Claim): Promise<string[]> {
  if (!claim.firstApprovedBy) return approversOf(claim, await itemsOf(claim.id))
  const skip = new Set([claim.firstApprovedBy, claim.claimantId].filter(Boolean))
  return (await holdersOf('budgets.claim.approve-any')).filter(id => !skip.has(id))
}

/**
 * Tells a budget's holders and the treasurers when one of its spending lines goes over, once per
 * crossing (BC-34): spent and committed above budgeted. A line back within it may be told again.
 */
export async function checkOverBudget(unit: UnitView, budget: Budget): Promise<void> {
  if (budget.state !== 'approved') return
  const notified = new Map((await all<{ id: string, at: number | null }>('SELECT id, over_notified_at AS at FROM budgets_lines WHERE budget_id = ?', budget.id)).map(r => [r.id, r.at]))
  let to: string[] | null = null
  for (const line of (await budgetLines(budget)).lines) {
    if (line.kind !== 'expense') continue
    const overMinor = line.figures.actualMinor + line.figures.committedMinor - line.figures.budgetedMinor
    const told = notified.get(line.id) != null
    if (overMinor <= 0) {
      if (told) unit.add({ sql: 'UPDATE budgets_lines SET over_notified_at = NULL WHERE id = ?', params: [line.id] })
      continue
    }
    if (told) continue
    unit.add({ sql: 'UPDATE budgets_lines SET over_notified_at = ? WHERE id = ? AND over_notified_at IS NULL', params: [nowMs(), line.id] })
    to ??= [...new Set([...await holdersOf('budgets.budget.hold', ['budgets.budget', budget.id]), ...await holdersOf('budgets.claim.approve-any')])]
    if (!to.length) continue
    await notify(unit, 'budgets.over-budget', {
      to,
      variables: { line: line.name, budget: budget.name, amount: await formatMoney(overMinor, budget.currency), link: `/console/budgets/${budget.id}` },
      subject: ['budgets.line', line.id],
    })
  }
}

/** The budgets a claim's items or a request's line are on. */
export async function budgetsTouched(payload: { claimId?: string, requestId?: string }): Promise<Budget[]> {
  const ids = payload.claimId
    ? await all<{ id: string }>('SELECT DISTINCT l.budget_id AS id FROM budgets_claim_items i JOIN budgets_lines l ON l.id = i.line_id WHERE i.claim_id = ?', payload.claimId)
    : await all<{ id: string }>('SELECT l.budget_id AS id FROM budgets_spending_requests r JOIN budgets_lines l ON l.id = r.line_id WHERE r.id = ?', payload.requestId ?? '')
  const out: Budget[] = []
  for (const { id } of ids) {
    const budget = await getBudget(id)
    if (budget) out.push(budget)
  }
  return out
}

/** Every approved budget checked for lines over: the daily safety net for spend that arrives without a decision, such as a bill. */
export async function sweepOverBudget(unit: UnitView): Promise<void> {
  for (const { id } of await all<{ id: string }>("SELECT id FROM budgets_budgets WHERE state = 'approved'")) {
    const budget = await getBudget(id)
    if (budget) await checkOverBudget(unit, budget)
  }
}
