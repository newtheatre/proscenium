// Deciding a claim (BC-21 to BC-25, BC-27; rules C1 to C3 and C5). Approval is per claim: each holder
// approves the items on the budgets they hold, and the approval that leaves no item undecided posts
// the expense in the same unit. Returning, declining and voiding each carry a note the claimant sees.
import { all, can, first, nowMs, refuse, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { notify } from '#modules/core'
import { postEntries, reversePosting, type EntryInput } from '#modules/finance'
import { budgetLines, requireBudget, requireLine } from './budgets'
import { budgetsOf, changed, heldBudgets, isClaimant, itemsOf, logEvent, marksOf, type Claim, type Item } from './claims'
import { pendingOn } from './pending'
import { formatMoney } from './money'

export interface ItemDecision {
  id: string
  lineId: string
  categoryId?: string | null
  approvedMinor: number
  partReason?: string | null
}

/** C1: never your own claim, nor one fulfilling a request you made. The Owner is not exempt. */
async function notOwn(actor: Actor, claim: Claim): Promise<void> {
  if (await isClaimant(claim, actor)) refuse('budgets.claim.own', 'This is your own claim, so someone else decides it.', { status: 403, remedy: 'Ask another holder of the budget, or the treasurer.' })
  if (claim.requestId && actor.accountId) {
    const asked = await first(`SELECT 1 FROM budgets_spending_requests WHERE id = ?1 AND requested_by IN (${accountScopeSql('?2')})`, claim.requestId, actor.accountId)
    if (asked) refuse('budgets.claim.own', 'You asked for the money this claim spends, so someone else decides it.', { status: 403 })
  }
}

function submitted(claim: Claim): void {
  if (claim.state !== 'submitted') refuse('budgets.claim.state', `This claim is ${claim.state}; only a submitted claim can be decided.`, { status: 409 })
}

/** An approver of at least one of the claim's budgets. */
async function requireApprover(actor: Actor, claim: Claim, items: readonly Item[]): Promise<{ any: boolean, held: Set<string> }> {
  const authority = await heldBudgets(actor, budgetsOf(items))
  if (!authority.held.size) refuse('budgets.claim.not-approver', 'Only a holder of a budget this claim charges, or the treasurer, decides it.', { status: 403 })
  return authority
}

/** How far over each line approving these amounts would take it, beyond what other claims and commitments already hold. */
async function overByLine(claim: Claim, decided: { lineId: string, amountMinor: number }[]): Promise<Map<string, number>> {
  const byLine = new Map<string, number>()
  for (const d of decided) byLine.set(d.lineId, (byLine.get(d.lineId) ?? 0) + d.amountMinor)
  const over = new Map<string, number>()
  const budgets = new Map<string, string>()
  for (const lineId of byLine.keys()) budgets.set(lineId, (await requireLine(lineId)).budget.id)
  for (const budgetId of new Set(budgets.values())) {
    const budget = await requireBudget(budgetId)
    const { lines } = await budgetLines(budget)
    const own = await pendingOn(budgetId)
    const others = await pendingOn(budgetId, claim.id)
    for (const line of lines) {
      const asked = byLine.get(line.id)
      if (asked === undefined) continue
      // The line's remaining already counts this claim as pending; take it back out before adding what is approved.
      const ownPending = (own.get(line.id) ?? 0) - (others.get(line.id) ?? 0)
      const left = line.figures.remainingMinor + ownPending
      if (asked > left) over.set(line.id, asked - Math.max(0, left))
    }
  }
  return over
}

/** What the approver may see before deciding: their items, how far over each line approving would go, and the marks. */
export async function reviewOf(actor: Actor, claim: Claim) {
  const items = await itemsOf(claim.id)
  const { any, held } = await heldBudgets(actor, budgetsOf(items))
  const mine = items.filter(i => i.budgetId && held.has(i.budgetId) && i.approvedMinor === null)
  const over = claim.state === 'submitted' ? await overByLine(claim, mine.map(i => ({ lineId: i.lineId!, amountMinor: i.amountMinor }))) : new Map<string, number>()
  return {
    items,
    yours: mine.map(i => i.id),
    any,
    overMinor: [...over.values()].reduce((a, b) => a + b, 0),
    marks: await marksOf(claim, items),
  }
}

async function checkDecisions(claim: Claim, items: readonly Item[], decisions: readonly ItemDecision[], held: Set<string>): Promise<void> {
  for (const d of decisions) {
    const item = items.find(i => i.id === d.id)
    if (!item) refuse('core.not-found', 'There is no such item on this claim.', { status: 404 })
    if (d.approvedMinor > item!.amountMinor) refuse('budgets.claim.too-much', 'An item cannot be approved for more than it cost.', { status: 422, fields: { [`items.${d.id}.approvedMinor`]: 'budgets.claim.too-much' } })
    if (d.approvedMinor < item!.amountMinor && !d.partReason) refuse('budgets.claim.part-reason', 'Say why less than the receipt is approved.', { status: 422, fields: { [`items.${d.id}.partReason`]: 'budgets.claim.part-reason' } })
    const { budget, line } = await requireLine(d.lineId)
    if (budget.state !== 'approved' || line.kind !== 'expense' || line.archivedAt) refuse('budgets.claim.line', 'Choose a spending line of an approved budget.', { status: 422, fields: { [`items.${d.id}.lineId`]: 'budgets.claim.line' } })
    if (!held.has(budget.id) || (item!.budgetId && !held.has(item!.budgetId))) refuse('budgets.claim.not-approver', 'You may approve only items on budgets you hold.', { status: 403 })
  }
  // An approver decides every item still waiting on budgets they hold, so a claim is never left half decided by one person.
  const waiting = items.filter(i => i.approvedMinor === null && i.budgetId && held.has(i.budgetId))
  const missing = waiting.filter(i => !decisions.some(d => d.id === i.id))
  if (missing.length) refuse('budgets.claim.undecided', 'Decide every item on the budgets you hold.', { status: 422, fields: Object.fromEntries(missing.map(i => [`items.${i.id}.approvedMinor`, 'budgets.claim.undecided'])) })
}

/**
 * Approves the actor's items of a submitted claim (BC-22). Over budget only the treasurer approves
 * (C3). When no item is left undecided, the claim is approved and its expense posted (C5).
 */
export async function approve(unit: UnitView, actor: Actor, claim: Claim, input: { version: number, items: ItemDecision[] }): Promise<{ state: 'approved' | 'submitted' }> {
  submitted(claim)
  await notOwn(actor, claim)
  const items = await itemsOf(claim.id)
  const { any, held } = await requireApprover(actor, claim, items)
  await checkDecisions(claim, items, input.items, held)
  const over = await overByLine(claim, input.items.map(d => ({ lineId: d.lineId, amountMinor: d.approvedMinor })))
  const overMinor = [...over.values()].reduce((a, b) => a + b, 0)
  if (overMinor > 0 && !any) refuse('budgets.claim.over-budget', 'Approving this would take a line over budget, so the treasurer decides it.', { status: 409, detail: { overMinor: String(overMinor) }, remedy: 'Leave it for the treasurer, or send it back.' })

  const at = nowMs()
  for (const d of input.items) {
    unit.add({
      sql: `UPDATE budgets_claim_items SET line_id = ?, category_id = coalesce(?, category_id, (SELECT category_id FROM budgets_lines WHERE id = ?)), approved_minor = ?, part_reason = ?, updated_at = ?
            WHERE id = ? AND approved_minor IS NULL AND claim_id IN (SELECT id FROM budgets_claims WHERE id = ? AND state = 'submitted' AND version = ?)`,
      params: [d.lineId, d.categoryId ?? null, d.lineId, d.approvedMinor, d.approvedMinor < (items.find(i => i.id === d.id)!.amountMinor) ? d.partReason ?? null : null, at, d.id, claim.id, input.version],
    }).expect(1, changed())
  }
  const decided = items.map(i => ({ ...i, ...input.items.find(d => d.id === i.id) }))
  const done = decided.every(i => i.approvedMinor !== null && i.approvedMinor !== undefined)
  const amountMinor = input.items.reduce((sum, d) => sum + d.approvedMinor, 0)
  if (!done) {
    // A first holder's approval is logged and moves nothing; the version still turns, so a racing decision loses.
    unit.add({ sql: "UPDATE budgets_claims SET version = version + 1, updated_at = ? WHERE id = ? AND state = 'submitted' AND version = ?", params: [at, claim.id, input.version] }).expect(1, changed())
    logEvent(unit, claim.id, { action: 'approved', by: actor.accountId ?? null, at, amountMinor })
    unit.audit({ action: 'update', record: ['budgets.claim', claim.id], detail: { approvedMinor: amountMinor, partial: true } })
    return { state: 'submitted' }
  }
  const total = decided.reduce((sum, i) => sum + (i.approvedMinor ?? 0), 0)
  if (total === 0) refuse('budgets.claim.nothing-approved', 'Nothing on this claim would be approved.', { status: 422, remedy: 'Decline it with a note instead.' })
  const postingId = await postExpense(unit, claim, decided as (Item & { approvedMinor: number, lineId: string })[], at)
  unit.add({
    sql: "UPDATE budgets_claims SET state = 'approved', approved_minor = ?1, decided_at = ?2, expense_posting_id = ?3, version = version + 1, updated_at = ?2 WHERE id = ?4 AND state = 'submitted' AND version = ?5", // not-policy: numbered parameters
    params: [total, at, postingId, claim.id, input.version],
  }).expect(1, changed())
  fulfil(unit, claim, total, at)
  logEvent(unit, claim.id, { action: 'approved', by: actor.accountId ?? null, at, amountMinor: total, postingId })
  unit.audit({ action: 'state', record: ['budgets.claim', claim.id], detail: { from: 'submitted', to: 'approved', approvedMinor: total } })
  unit.announce('budgets.claim.decided', { claimId: claim.id, decision: 'approved', amountMinor: total }, { record: ['budgets.claim', claim.id] })
  await tellClaimant(unit, claim, 'approved', total, decided.some(i => i.partReason) ? 'Part of it was approved; the reasons are on the claim.' : 'It will be paid by the route you chose.')
  return { state: 'approved' }
}

/** What a claim posts at approval: each item debits its category's account, tagged with its line and production; claims-payable is credited. */
async function postExpense(unit: UnitView, claim: Claim, items: (Item & { approvedMinor: number, lineId: string })[], at: number): Promise<string> {
  const accounts = await all<{ lineId: string, accountId: string | null, productionId: string | null }>(
    `SELECT l.id AS lineId, k.account_id AS accountId, b.production_id AS productionId FROM budgets_lines l JOIN budgets_budgets b ON b.id = l.budget_id
      LEFT JOIN budgets_categories k ON k.id = l.category_id WHERE l.id IN (SELECT value FROM json_each(?))`, JSON.stringify([...new Set(items.map(i => i.lineId))]))
  const categoryAccounts = new Map((await all<{ id: string, accountId: string | null }>(
    'SELECT id, account_id AS accountId FROM budgets_categories WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(items.map(i => i.categoryId).filter(Boolean)))).map(r => [r.id, r.accountId]))
  const entries: EntryInput[] = []
  for (const item of items) {
    if (!item.approvedMinor) continue
    const line = accounts.find(a => a.lineId === item.lineId)
    const account = (item.categoryId ? categoryAccounts.get(item.categoryId) : null) ?? line?.accountId ?? null
    entries.push({ account: account ?? { key: 'budgets.expenses' }, amountMinor: item.approvedMinor, budgetLineId: item.lineId, ...(line?.productionId ? { productionId: line.productionId } : {}) })
  }
  const total = entries.reduce((sum, e) => sum + e.amountMinor, 0)
  entries.push({ account: { key: 'budgets.claims-payable' }, amountMinor: -total })
  return postEntries(unit, {
    key: `budgets:claim:${claim.id}:expense`,
    source: { module: 'budgets', type: 'budgets.claim', id: claim.id },
    kind: 'transfer',
    purpose: 'expense',
    occurredAt: at,
    currency: claim.currency,
    entries,
  })
}

/** BC-27: an approved claim fulfils the request it names, up to the request's amount. */
function fulfil(unit: UnitView, claim: Claim, amountMinor: number, at: number): void {
  if (!claim.requestId) return
  unit.add({
    sql: `UPDATE budgets_spending_requests SET fulfilled_minor = min(amount_minor, fulfilled_minor + ?1),
            state = CASE WHEN fulfilled_minor + ?1 >= amount_minor THEN 'fulfilled' ELSE state END, updated_at = ?2
          WHERE id = ?3 AND state = 'approved'`, // not-policy: numbered parameters
    params: [amountMinor, at, claim.requestId],
  })
}

async function tellClaimant(unit: UnitView, claim: Claim, decision: string, amountMinor: number, note: string): Promise<void> {
  if (!claim.claimantId) return
  await notify(unit, 'budgets.claim-decided', {
    to: claim.claimantId,
    variables: { number: claim.number ?? '', title: claim.title, decision, amount: await formatMoney(amountMinor, claim.currency), note, link: `/members/expenses/claims/${claim.id}` },
    subject: ['budgets.claim', claim.id],
  })
}

/** Sends a claim back to its claimant to change (BC-23), or declines it; either way with a note they see. */
export async function reject(unit: UnitView, actor: Actor, claim: Claim, input: { version: number, note: string, decline: boolean }): Promise<void> {
  submitted(claim)
  await notOwn(actor, claim)
  await requireApprover(actor, claim, await itemsOf(claim.id))
  const state = input.decline ? 'declined' : 'returned'
  const at = nowMs()
  unit.add({ sql: "UPDATE budgets_claim_items SET approved_minor = NULL, part_reason = NULL WHERE claim_id IN (SELECT id FROM budgets_claims WHERE id = ? AND state = 'submitted' AND version = ?)", params: [claim.id, input.version] })
  unit.add({
    sql: `UPDATE budgets_claims SET state = ?1, decided_at = CASE WHEN ?1 = 'declined' THEN ?2 ELSE decided_at END, version = version + 1, updated_at = ?2
          WHERE id = ?3 AND state = 'submitted' AND version = ?4`, // not-policy: numbered parameters
    params: [state, at, claim.id, input.version],
  }).expect(1, changed())
  logEvent(unit, claim.id, { action: state, by: actor.accountId ?? null, at, note: input.note })
  unit.audit({ action: 'state', record: ['budgets.claim', claim.id], detail: { from: 'submitted', to: state } })
  unit.announce('budgets.claim.decided', { claimId: claim.id, decision: state, amountMinor: 0 }, { record: ['budgets.claim', claim.id] })
  await tellClaimant(unit, claim, input.decline ? 'declined' : 'sent back to you', claim.totalMinor, input.note)
}

/** Voids an approved claim nothing has been paid on (BC-25): the treasurer, never on their own; the expense is reversed. */
export async function voidClaim(unit: UnitView, actor: Actor, claim: Claim, input: { version: number, note: string }): Promise<void> {
  if (!(await can(actor, 'budgets.claim.approve-any')).allowed) refuse('budgets.claim.not-approver', 'Only the treasurer voids an approved claim.', { status: 403 })
  await notOwn(actor, claim)
  if (claim.state !== 'approved') refuse('budgets.claim.state', `This claim is ${claim.state}; only an approved claim can be voided.`, { status: 409 })
  if (claim.paidMinor > 0) refuse('budgets.claim.paid', 'Something has been paid on this claim, so it cannot be voided.', { status: 409 })
  const at = nowMs()
  const postingId = claim.expensePostingId ? await reversePosting(unit, claim.expensePostingId, { occurredAt: at }) : null
  unit.add({
    sql: "UPDATE budgets_claims SET state = 'voided', version = version + 1, updated_at = ? WHERE id = ? AND state = 'approved' AND paid_minor = 0 AND version = ?",
    params: [at, claim.id, input.version],
  }).expect(1, changed())
  if (claim.requestId) {
    unit.add({
      sql: 'UPDATE budgets_spending_requests SET fulfilled_minor = max(0, fulfilled_minor - ?1), state = CASE WHEN state = \'fulfilled\' THEN \'approved\' ELSE state END, updated_at = ?2 WHERE id = ?3', // not-policy: numbered parameters
      params: [claim.approvedMinor ?? 0, at, claim.requestId],
    })
  }
  logEvent(unit, claim.id, { action: 'voided', by: actor.accountId ?? null, at, note: input.note, postingId })
  unit.audit({ action: 'state', record: ['budgets.claim', claim.id], detail: { from: 'approved', to: 'voided' } })
  unit.announce('budgets.claim.decided', { claimId: claim.id, decision: 'voided', amountMinor: claim.approvedMinor ?? 0 }, { record: ['budgets.claim', claim.id] })
  await tellClaimant(unit, claim, 'voided', claim.approvedMinor ?? 0, input.note)
}

export interface WaitingClaim { id: string, number: string | null, title: string, claimantId: string | null, currency: string, totalMinor: number, submittedAt: number | null, overMinor: number, late: boolean, notAskedFirst: boolean }

/** Claims waiting on this person (BC-21): submitted, not their own, with items still to decide on budgets they hold; oldest first. */
export async function claimsWaitingOn(actor: Actor): Promise<WaitingClaim[]> {
  if (!actor.accountId) return []
  const rows = await all<Claim>(
    `SELECT c.id, c.number, c.claimant_id AS claimantId, c.request_id AS requestId, c.title, c.state, c.currency, c.total_minor AS totalMinor,
        c.approved_minor AS approvedMinor, c.paid_minor AS paidMinor, c.pay_route AS payRoute, c.declared_at AS declaredAt, c.submitted_at AS submittedAt,
        c.decided_at AS decidedAt, c.expense_posting_id AS expensePostingId, c.version, c.created_at AS createdAt
      FROM budgets_claims c WHERE c.state = 'submitted' AND (c.claimant_id IS NULL OR c.claimant_id NOT IN (${accountScopeSql('?1')}))
      ORDER BY c.submitted_at`, actor.accountId)
  const out: WaitingClaim[] = []
  for (const claim of rows) {
    const review = await reviewOf(actor, claim)
    if (!review.yours.length) continue
    out.push({
      id: claim.id, number: claim.number, title: claim.title, claimantId: claim.claimantId, currency: claim.currency, totalMinor: claim.totalMinor,
      submittedAt: claim.submittedAt, overMinor: review.overMinor, late: review.marks.lateItems.length > 0, notAskedFirst: review.marks.notAskedFirst,
    })
  }
  return out
}
