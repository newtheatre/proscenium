// Expense claims (BC-19 to BC-28, spec part 3, "The claim"): a member records what they bought, with
// a receipt for each item, and submits it; holders of the lines it touches approve it. Its content is
// fixed once submitted. Deciding a claim is in claim-decisions.ts.
import { all, can, first, localDate, newId, nowMs, refuse, today, useSetting, files as store, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel, holdersOf, notify } from '#modules/core'
import { financeYearOf } from '#modules/finance'
import { requireLine, theatreCurrency } from './budgets'
import { formatMoney } from './money'

export type ClaimState = 'draft' | 'submitted' | 'returned' | 'approved' | 'declined' | 'withdrawn' | 'voided' | 'paid'

export const RECEIPT_SLOT = 'budgets.receipt'
export const ITEM_OWNER = 'budgets.claim-item'
const RECEIPTS_PER_ITEM = 5 // not-policy: the specification's bound on one item's receipts
const MEGABYTE = 1024 * 1024 // not-policy: unit of size
const SECOND = 1000 // not-policy: settings are whole seconds
const EDITABLE: readonly ClaimState[] = ['draft', 'returned']

export interface Claim {
  id: string
  number: string | null
  claimantId: string | null
  requestId: string | null
  title: string
  state: ClaimState
  currency: string
  totalMinor: number
  approvedMinor: number | null
  paidMinor: number
  payRoute: string
  declaredAt: number | null
  submittedAt: number | null
  decidedAt: number | null
  expensePostingId: string | null
  version: number
  createdAt: number
}

export interface Receipt { id: string, name: string | null, state: string, mediaType: string }

export interface Item {
  id: string
  spentOn: string
  description: string
  supplier: string | null
  amountMinor: number
  lineId: string | null
  lineName: string | null
  budgetId: string | null
  budgetName: string | null
  budgetState: string | null
  productionId: string | null
  categoryId: string | null
  categoryName: string | null
  noReceiptReason: string | null
  approvedMinor: number | null
  partReason: string | null
  receipts: Receipt[]
}

const COLUMNS = `c.id, c.number, c.claimant_id AS claimantId, c.request_id AS requestId, c.title, c.state, c.currency,
  c.total_minor AS totalMinor, c.approved_minor AS approvedMinor, c.paid_minor AS paidMinor, c.pay_route AS payRoute,
  c.declared_at AS declaredAt, c.submitted_at AS submittedAt, c.decided_at AS decidedAt,
  c.expense_posting_id AS expensePostingId, c.version, c.created_at AS createdAt`

export async function getClaim(id: string | undefined): Promise<Claim | null> {
  return id ? first<Claim>(`SELECT ${COLUMNS} FROM budgets_claims c WHERE c.id = ?`, id) : null
}

export async function requireClaim(id: string | undefined): Promise<Claim> {
  const claim = await getClaim(id)
  if (!claim) refuse('core.not-found', 'There is no such claim.', { status: 404 })
  return claim!
}

/** A claim's items in order, each with its line, budget, category and receipts. */
export async function itemsOf(claimId: string): Promise<Item[]> {
  const rows = await all<Omit<Item, 'receipts'>>(
    `SELECT i.id, i.spent_on AS spentOn, i.description, i.supplier, i.amount_minor AS amountMinor, i.line_id AS lineId, l.name AS lineName,
        b.id AS budgetId, b.name AS budgetName, b.state AS budgetState, b.production_id AS productionId, i.category_id AS categoryId, k.name AS categoryName,
        i.no_receipt_reason AS noReceiptReason, i.approved_minor AS approvedMinor, i.part_reason AS partReason
      FROM budgets_claim_items i LEFT JOIN budgets_lines l ON l.id = i.line_id LEFT JOIN budgets_budgets b ON b.id = l.budget_id
      LEFT JOIN budgets_categories k ON k.id = i.category_id WHERE i.claim_id = ? ORDER BY i.sort_order, i.id`, claimId)
  const receipts = await all<Receipt & { ownerId: string }>(
    `SELECT id, owner_id AS ownerId, original_name AS name, state, media_type AS mediaType FROM core_files
      WHERE owner_type = ? AND slot = ? AND state IN ('pending', 'ready', 'rejected')
        AND owner_id IN (SELECT id FROM budgets_claim_items WHERE claim_id = ?) ORDER BY created_at`, ITEM_OWNER, RECEIPT_SLOT, claimId)
  return rows.map(row => ({ ...row, receipts: receipts.filter(r => r.ownerId === row.id).map(({ ownerId: _, ...r }) => r) }))
}

export async function isClaimant(claim: Pick<Claim, 'claimantId'>, actor: Actor): Promise<boolean> {
  if (!claim.claimantId || !actor.accountId) return false
  return !!(await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, claim.claimantId, actor.accountId))
}

/** The budgets a claim's items charge. */
export function budgetsOf(items: readonly Item[]): string[] {
  return [...new Set(items.map(i => i.budgetId).filter((b): b is string => !!b))]
}

/** Who may approve on which budgets: all of them for the treasurer, else those the actor holds. */
export async function heldBudgets(actor: Actor, budgetIds: readonly string[]): Promise<{ any: boolean, held: Set<string> }> {
  const any = (await can(actor, 'budgets.claim.approve-any')).allowed
  const held = new Set<string>()
  for (const id of budgetIds) if (any || (await can(actor, 'budgets.budget.hold', ['budgets.budget', id])).allowed) held.add(id)
  return { any, held }
}

/** Whether the actor may see this claim with its claimant and receipts (BC-21): its claimant, an approver of its lines, or view-all. */
export async function mayView(actor: Actor, claim: Claim, items?: Item[]): Promise<boolean> {
  if (await isClaimant(claim, actor)) return true
  if ((await can(actor, 'budgets.claim.view-all')).allowed) return true
  if (claim.state === 'draft') return false
  const { held } = await heldBudgets(actor, budgetsOf(items ?? await itemsOf(claim.id)))
  return held.size > 0
}

function editable(claim: Claim): void {
  if (!EDITABLE.includes(claim.state)) refuse('budgets.claim.fixed', 'A claim is fixed once submitted; it changes only while a draft or sent back to you.', { status: 409 })
}

export async function requireOwnEditable(actor: Actor, claim: Claim): Promise<void> {
  if (!(await isClaimant(claim, actor))) refuse('core.not-found', 'There is no such claim.', { status: 404 })
  editable(claim)
}

/** The request a claim fulfils: the claimant's own, approved. */
async function checkRequest(actor: Actor, requestId: string | null | undefined): Promise<void> {
  if (!requestId) return
  const ok = await first(`SELECT 1 FROM budgets_spending_requests WHERE id = ?1 AND state = 'approved' AND requested_by IN (${accountScopeSql('?2')})`, requestId, actor.accountId ?? '')
  if (!ok) refuse('budgets.claim.request', 'Link a request of yours that has been approved.', { status: 422, fields: { requestId: 'budgets.claim.request' } })
}

/** Starts a claim as a draft (BC-19). It is numbered when first submitted. */
export async function createClaim(unit: UnitView, actor: Actor, input: { title: string, requestId?: string | null }): Promise<string> {
  await checkRequest(actor, input.requestId)
  const id = newId('ecl')
  unit.add({
    sql: "INSERT INTO budgets_claims (id, claimant_id, request_id, title, state, currency, pay_route, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, 'bank-transfer', ?, ?)",
    params: [id, actor.accountId ?? null, input.requestId ?? null, input.title, await theatreCurrency(), nowMs(), nowMs()],
  })
  unit.audit({ action: 'create', record: ['budgets.claim', id] })
  return id
}

export async function updateClaim(unit: UnitView, actor: Actor, claim: Claim, input: { title: string, requestId?: string | null }): Promise<void> {
  await requireOwnEditable(actor, claim)
  await checkRequest(actor, input.requestId)
  unit.add({
    sql: "UPDATE budgets_claims SET title = ?, request_id = ?, updated_at = ? WHERE id = ? AND state IN ('draft', 'returned') AND version = ?",
    params: [input.title, input.requestId ?? null, nowMs(), claim.id, claim.version],
  }).expect(1, changed())
  unit.audit({ action: 'update', record: ['budgets.claim', claim.id] })
}

export interface ItemInput {
  spentOn: string
  description: string
  supplier?: string | null
  amountMinor: number
  lineId?: string | null
  categoryId?: string | null
  noReceiptReason?: string | null
}

/** A line an item may name: a live spending line of an approved budget. Its category is the item's default. */
async function checkLine(lineId: string | null | undefined): Promise<string | null> {
  if (!lineId) return null
  const { budget, line } = await requireLine(lineId)
  if (budget.state !== 'approved' || line.kind !== 'expense' || line.archivedAt)
    refuse('budgets.claim.line', 'Choose a spending line of an approved budget.', { status: 422, fields: { lineId: 'budgets.claim.line' } })
  return (await first<{ categoryId: string | null }>('SELECT category_id AS categoryId FROM budgets_lines WHERE id = ?', lineId))?.categoryId ?? null
}

async function checkItem(input: ItemInput): Promise<string | null> {
  if (input.spentOn > await today()) refuse('budgets.claim.future', 'The date spent cannot be in the future.', { status: 422, fields: { spentOn: 'budgets.claim.future' } })
  const lineCategory = await checkLine(input.lineId)
  if (input.categoryId && !(await first('SELECT 1 FROM budgets_categories WHERE id = ? AND archived_at IS NULL', input.categoryId)))
    refuse('budgets.claim.category', 'Choose a spending category.', { status: 422, fields: { categoryId: 'budgets.claim.category' } })
  return input.categoryId ?? lineCategory
}

/** The claim's total is kept in the same batch as each change to its items. */
function retotal(unit: UnitView, claimId: string): void {
  unit.add({
    sql: 'UPDATE budgets_claims SET total_minor = (SELECT coalesce(sum(amount_minor), 0) FROM budgets_claim_items WHERE claim_id = ?1), updated_at = ?2 WHERE id = ?1', // not-policy: numbered parameters
    params: [claimId, nowMs()],
  })
}

const whileEditable = "claim_id IN (SELECT id FROM budgets_claims WHERE id = ? AND state IN ('draft', 'returned'))"

export async function addItem(unit: UnitView, actor: Actor, claim: Claim, input: ItemInput): Promise<string> {
  await requireOwnEditable(actor, claim)
  const categoryId = await checkItem(input)
  const id = newId('eci')
  unit.add({
    sql: `INSERT INTO budgets_claim_items (id, claim_id, spent_on, description, supplier, amount_minor, line_id, category_id, no_receipt_reason, sort_order, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(sort_order), 0) + 1 FROM budgets_claim_items WHERE claim_id = ?), ?, ? FROM budgets_claims WHERE id = ? AND state IN ('draft', 'returned')`,
    params: [id, input.spentOn, input.description, input.supplier ?? null, input.amountMinor, input.lineId ?? null, categoryId, input.noReceiptReason ?? null, claim.id, nowMs(), nowMs(), claim.id],
  }).expect(1, changed())
  retotal(unit, claim.id)
  return id
}

export async function requireItem(claim: Claim, itemId: string | undefined): Promise<Item> {
  const item = (await itemsOf(claim.id)).find(i => i.id === itemId)
  if (!item) refuse('core.not-found', 'There is no such item on this claim.', { status: 404 })
  return item!
}

export async function updateItem(unit: UnitView, actor: Actor, claim: Claim, item: Item, input: ItemInput): Promise<void> {
  await requireOwnEditable(actor, claim)
  const categoryId = await checkItem(input)
  unit.add({
    sql: `UPDATE budgets_claim_items SET spent_on = ?, description = ?, supplier = ?, amount_minor = ?, line_id = ?, category_id = ?, no_receipt_reason = ?, updated_at = ?
          WHERE id = ? AND ${whileEditable}`,
    params: [input.spentOn, input.description, input.supplier ?? null, input.amountMinor, input.lineId ?? null, categoryId, input.noReceiptReason ?? null, nowMs(), item.id, claim.id],
  }).expect(1, changed())
  retotal(unit, claim.id)
}

/** Removes an item and its receipts. */
export async function removeItem(unit: UnitView, actor: Actor, claim: Claim, item: Item): Promise<void> {
  await requireOwnEditable(actor, claim)
  const at = nowMs()
  unit.add({
    sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?1, purge_after = ?1 WHERE owner_type = ?2 AND owner_id = ?3 AND slot = ?4 AND state IN ('pending', 'ready', 'rejected')", // not-policy: numbered parameters
    params: [at, ITEM_OWNER, item.id, RECEIPT_SLOT],
  })
  unit.add({ sql: `DELETE FROM budgets_claim_items WHERE id = ? AND ${whileEditable}`, params: [item.id, claim.id] }).expect(1, changed())
  retotal(unit, claim.id)
}

export async function receiptLimit(): Promise<number> {
  return (await useSetting('core.files.document-limit') as number) * MEGABYTE
}

/** Stores a receipt photo or PDF on an item and asks core to check it (BC-19). */
export async function uploadReceipt(unit: UnitView, actor: Actor, claim: Claim, item: Item, input: { name: string, bytes: Uint8Array }): Promise<{ id: string, state: 'pending' }> {
  await requireOwnEditable(actor, claim)
  if (input.bytes.length === 0) refuse('core.files.empty', 'The file is empty.', { status: 422, fields: { file: 'empty' } })
  if (input.bytes.length > await receiptLimit()) refuse('core.files.too-large', 'This file is larger than a receipt may be.', { status: 413, fields: { file: 'too-large' } })
  if (item.receipts.filter(r => r.state !== 'rejected').length >= RECEIPTS_PER_ITEM)
    refuse('budgets.claim.receipts', 'An item holds at most five receipts.', { status: 422, fields: { file: 'budgets.claim.receipts' } })
  const id = newId('fil', { random: true })
  const objectKey = `files/${crypto.randomUUID()}`
  await store.put(objectKey, input.bytes)
  const digest = await crypto.subtle.digest('SHA-256', input.bytes as Uint8Array<ArrayBuffer>)
  const sha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
  unit.add({
    sql: "INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, original_name, text_class, media_type, byte_size, sha256, access, state, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'personal', 'application/octet-stream', ?, ?, 'record', 'pending', ?, ?)",
    params: [id, objectKey, ITEM_OWNER, item.id, RECEIPT_SLOT, input.name, input.bytes.length, sha, actor.accountId ?? null, nowMs()],
  })
  unit.enqueue('core.check-file', { fileId: id })
  unit.audit({ action: 'create', record: ['core.file', id], detail: { slot: RECEIPT_SLOT } })
  return { id, state: 'pending' }
}

export async function removeReceipt(unit: UnitView, actor: Actor, claim: Claim, item: Item, fileId: string): Promise<void> {
  await requireOwnEditable(actor, claim)
  if (!item.receipts.some(r => r.id === fileId)) refuse('core.not-found', 'There is no such receipt.', { status: 404 })
  const at = nowMs()
  unit.add({
    sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?1, purge_after = ?1 WHERE id = ?2 AND owner_type = ?3 AND owner_id = ?4", // not-policy: numbered parameters
    params: [at, fileId, ITEM_OWNER, item.id],
  }).expect(1, changed())
}

/** What stops a claim being submitted, item by item, as field errors. */
async function submitProblems(items: readonly Item[]): Promise<Record<string, string>> {
  const required = await useSetting('budgets.claims.receipt-required') as boolean
  const problems: Record<string, string> = {}
  if (!items.length) problems.items = 'budgets.claim.no-items'
  for (const item of items) {
    if (!item.lineId || item.budgetState !== 'approved') problems[`items.${item.id}.lineId`] = 'budgets.claim.line'
    const receipted = item.receipts.some(r => r.state !== 'rejected')
    if (required && !receipted && !item.noReceiptReason) problems[`items.${item.id}.receipt`] = 'budgets.claim.no-receipt'
  }
  return problems
}

/** The approvers a new claim is waiting on: holders of its budgets, or the treasurer when none hold them. */
export async function approversOf(claim: Claim, items: readonly Item[]): Promise<string[]> {
  const out = new Set<string>()
  for (const budgetId of budgetsOf(items)) for (const id of await holdersOf('budgets.budget.hold', ['budgets.budget', budgetId])) out.add(id)
  if (!out.size) for (const id of await holdersOf('budgets.claim.approve-any')) out.add(id)
  if (claim.claimantId) out.delete(claim.claimantId)
  return [...out]
}

/**
 * Submits a draft or a returned claim (BC-20). Every item names a line of an approved budget and has a
 * receipt or a reason; the claimant declares it true. A first submission takes the year's next number.
 */
export async function submit(unit: UnitView, actor: Actor, claim: Claim, input: { declared: true }): Promise<void> {
  await requireOwnEditable(actor, claim)
  const items = await itemsOf(claim.id)
  const problems = await submitProblems(items)
  if (Object.keys(problems).length) refuse('budgets.claim.incomplete', 'Finish the claim before submitting it.', { status: 422, fields: problems })
  const at = nowMs()
  const number = claim.number ?? await takeNumber(unit)
  unit.add({ sql: 'UPDATE budgets_claims SET number = ? WHERE id = ? AND number IS NULL', params: [number, claim.id] })
  // A returned claim is decided afresh: approvals from before go.
  unit.add({ sql: `UPDATE budgets_claim_items SET approved_minor = NULL, part_reason = NULL WHERE ${whileEditable}`, params: [claim.id] })
  unit.add({
    sql: "UPDATE budgets_claims SET state = 'submitted', declared_at = ?1, submitted_at = ?1, version = version + 1, updated_at = ?1 WHERE id = ?2 AND state IN ('draft', 'returned') AND version = ?3", // not-policy: numbered parameters
    params: [at, claim.id, claim.version],
  }).expect(1, changed())
  logEvent(unit, claim.id, { action: claim.state === 'returned' ? 'resubmitted' : 'submitted', by: actor.accountId ?? null, at, amountMinor: claim.totalMinor })
  unit.audit({ action: 'state', record: ['budgets.claim', claim.id], detail: { from: claim.state, to: 'submitted', declared: input.declared } })
  const to = await approversOf(claim, items)
  if (to.length) {
    await notify(unit, 'budgets.claim-to-approve', {
      to,
      variables: { person: claim.claimantId ? await accountLabel(claim.claimantId) : '', amount: await formatMoney(claim.totalMinor, claim.currency), number, title: claim.title, link: `/console/budgets/claims/${claim.id}` },
      subject: ['budgets.claim', claim.id],
    })
  }
}

/** The finance year's next claim number, "2026-0042"; the counter is raised on the statement, so two submissions never share one. */
async function takeNumber(unit: UnitView): Promise<string> {
  const year = await financeYearOf(await today())
  const next = (await first<{ n: number }>('SELECT next_number AS n FROM budgets_counters WHERE year_starts_on = ?', year.startsOn))?.n ?? 1
  unit.add({ sql: 'INSERT INTO budgets_counters (year_starts_on, next_number) VALUES (?, 1) ON CONFLICT (year_starts_on) DO NOTHING', params: [year.startsOn] })
  unit.add({ sql: 'UPDATE budgets_counters SET next_number = next_number + 1 WHERE year_starts_on = ? AND next_number = ?', params: [year.startsOn, next] }).expect(1, changed())
  return `${year.startsOn.slice(0, 4)}-${String(next).padStart(4, '0')}` // not-policy: the year of an ISO date and four digits, as the spec's "2026-0042"
}

/** Withdraws a claim nobody has decided (BC-24): nothing was posted, so nothing is undone. */
export async function withdraw(unit: UnitView, actor: Actor, claim: Claim): Promise<void> {
  if (!(await isClaimant(claim, actor))) refuse('core.not-found', 'There is no such claim.', { status: 404 })
  if (!['draft', 'submitted', 'returned'].includes(claim.state)) refuse('budgets.claim.state', `This claim is ${claim.state}; only one not yet decided can be withdrawn.`, { status: 409 })
  const at = nowMs()
  unit.add({
    sql: "UPDATE budgets_claims SET state = 'withdrawn', version = version + 1, updated_at = ? WHERE id = ? AND state IN ('draft', 'submitted', 'returned') AND version = ?",
    params: [at, claim.id, claim.version],
  }).expect(1, changed())
  logEvent(unit, claim.id, { action: 'withdrawn', by: actor.accountId ?? null, at })
  unit.audit({ action: 'state', record: ['budgets.claim', claim.id], detail: { from: claim.state, to: 'withdrawn' } })
}

export interface ClaimEvent { action: string, by: string | null, at: number, amountMinor?: number | null, note?: string | null, postingId?: string | null }

export function logEvent(unit: UnitView, claimId: string, event: ClaimEvent): void {
  unit.add({
    sql: 'INSERT INTO budgets_claim_events (id, claim_id, action, by, at, amount_minor, note, posting_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('ece'), claimId, event.action, event.by, event.at, event.amountMinor ?? null, event.note ?? null, event.postingId ?? null],
  })
}

export async function eventsOf(claimId: string): Promise<(ClaimEvent & { byName: string | null })[]> {
  const rows = await all<ClaimEvent>('SELECT action, by, at, amount_minor AS amountMinor, note, posting_id AS postingId FROM budgets_claim_events WHERE claim_id = ? ORDER BY at, id', claimId)
  const out = []
  for (const row of rows) out.push({ ...row, byName: row.by ? await accountLabel(row.by) : null })
  return out
}

export function changed() {
  return { code: 'budgets.claim.changed', reason: 'This claim has just changed. Look again.' }
}

/** Marks for the approver (BC-28): items spent long before submission, and a large claim nobody asked about first. */
export async function marksOf(claim: Claim, items: readonly Item[]): Promise<{ lateItems: string[], notAskedFirst: boolean }> {
  const lateAfter = await useSetting('budgets.claims.late-after') as number
  const cutoff = await localDate((claim.submittedAt ?? nowMs()) - lateAfter * SECOND)
  const expected = await useSetting('budgets.requests.expected-above') as number | null
  return {
    lateItems: items.filter(i => i.spentOn < cutoff).map(i => i.id),
    notAskedFirst: expected !== null && !claim.requestId && claim.totalMinor > expected,
  }
}

export interface ClaimSummary { id: string, number: string | null, title: string, state: ClaimState, currency: string, totalMinor: number, approvedMinor: number | null, submittedAt: number | null, createdAt: number }
const SUMMARY = 'c.id, c.number, c.title, c.state, c.currency, c.total_minor AS totalMinor, c.approved_minor AS approvedMinor, c.submitted_at AS submittedAt, c.created_at AS createdAt'

/** The person's own claims, open ones first, newest first. */
export async function myClaims(accountId: string): Promise<ClaimSummary[]> {
  return all<ClaimSummary>(
    `SELECT ${SUMMARY} FROM budgets_claims c WHERE c.claimant_id IN (${accountScopeSql('?1')})
      ORDER BY c.state NOT IN ('draft', 'returned', 'submitted', 'approved'), c.created_at DESC`, accountId)
}
