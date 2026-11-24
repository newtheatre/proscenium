// Paying approved claims (BC-29 to BC-32). Payments records the money out; its disbursement handler,
// here, clears claims payable and raises what is paid, never past what was approved. A claim fully
// paid is marked paid and its claimant told; a reversed payment puts it back to approved.
import { all, can, localDate, nowMs, refuse, useContext, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel } from '#modules/core'
import { toCsv } from '#modules/finance'
import { getClaim, isClaimant, logEvent } from './claims'
import { tellClaimant } from './claim-decisions'

interface Part { disbursementId: string, ownerRecord: string, amountMinor: number, currency: string }

const overpaid = { code: 'budgets.claim.overpaid', reason: 'That is more than is still owed on this claim, or the claim is no longer approved.' }

/** BC-30: a payment for one claim, by someone who may pay claims and is not its claimant (C1). */
export async function settlePart(unit: UnitView, part: Part) {
  const { actor } = useContext()
  if (!(await can(actor, 'budgets.claim.pay')).allowed) refuse('budgets.claim.not-payer', 'Only someone who pays claims records a payment of one.', { status: 403 })
  const claim = await getClaim(part.ownerRecord)
  if (!claim) refuse('core.not-found', 'There is no such claim.', { status: 404 })
  if (await isClaimant(claim!, actor)) refuse('budgets.claim.own', 'This is your own claim, so someone else records paying it.', { status: 403 })
  if (claim!.currency !== part.currency) refuse('budgets.claim.currency', 'This claim is in another currency.', { status: 422 })
  const at = nowMs()
  unit.add({
    sql: `UPDATE budgets_claims SET paid_minor = paid_minor + ?1, state = CASE WHEN paid_minor + ?1 >= approved_minor THEN 'paid' ELSE state END, version = version + 1, updated_at = ?2
          WHERE id = ?3 AND state = 'approved' AND paid_minor + ?1 <= approved_minor`, // not-policy: numbered parameters
    params: [part.amountMinor, at, claim!.id],
  }).expect(1, overpaid)
  logEvent(unit, claim!.id, { action: 'paid', by: actor.accountId ?? null, at, amountMinor: part.amountMinor, disbursementId: part.disbursementId })
  const full = claim!.paidMinor + part.amountMinor >= (claim!.approvedMinor ?? 0)
  unit.audit({ action: full ? 'state' : 'update', record: ['budgets.claim', claim!.id], detail: full ? { from: 'approved', to: 'paid' } : { paidMinor: claim!.paidMinor + part.amountMinor } })
  if (full) await tellClaimant(unit, claim!, 'paid', claim!.approvedMinor ?? 0, 'The money is on its way by the route you chose.')
  return [{ account: { key: 'budgets.claims-payable' }, amountMinor: part.amountMinor }]
}

/** BC-31: a payment reversed (a bounced transfer) lowers what is paid; a paid claim is approved again. */
export async function reversePart(unit: UnitView, part: Part): Promise<void> {
  const { actor } = useContext()
  const at = nowMs()
  unit.add({
    sql: "UPDATE budgets_claims SET paid_minor = paid_minor - ?1, state = 'approved', version = version + 1, updated_at = ?2 WHERE id = ?3 AND state IN ('approved', 'paid') AND paid_minor >= ?1", // not-policy: numbered parameters
    params: [part.amountMinor, at, part.ownerRecord],
  }).expect(1, { code: 'budgets.claim.not-paid', reason: 'This claim does not show that payment.' })
  logEvent(unit, part.ownerRecord, { action: 'payment-reversed', by: actor.accountId ?? null, at, amountMinor: part.amountMinor, disbursementId: part.disbursementId })
  unit.audit({ action: 'state', record: ['budgets.claim', part.ownerRecord], detail: { reversedMinor: part.amountMinor } })
}

export interface ClaimToPay {
  id: string
  number: string | null
  title: string
  claimantId: string | null
  claimant: string
  payRoute: string
  currency: string
  approvedMinor: number
  paidMinor: number
  owedMinor: number
  decidedAt: number | null
}

/** BC-29: approved claims with money still owed, not the payer's own, oldest decision first. */
export async function claimsToPay(actor: Actor, route?: string): Promise<ClaimToPay[]> {
  const rows = await all<Omit<ClaimToPay, 'claimant' | 'owedMinor'>>(
    `SELECT c.id, c.number, c.title, c.claimant_id AS claimantId, c.pay_route AS payRoute, c.currency, c.approved_minor AS approvedMinor,
        c.paid_minor AS paidMinor, c.decided_at AS decidedAt
      FROM budgets_claims c WHERE c.state = 'approved' AND (?2 IS NULL OR c.pay_route = ?2)
        AND (c.claimant_id IS NULL OR ?1 IS NULL OR c.claimant_id NOT IN (${accountScopeSql('?1')}))
      ORDER BY c.decided_at, c.id`, actor.accountId ?? null, route ?? null)
  const out: ClaimToPay[] = []
  for (const row of rows) out.push({ ...row, claimant: row.claimantId ? await accountLabel(row.claimantId) : '', owedMinor: row.approvedMinor - row.paidMinor })
  return out
}

const SCHEDULE_COLUMNS = [
  { key: 'number', label: 'Claim' },
  { key: 'claimant', label: 'Claimant' },
  { key: 'approvedOn', label: 'Approved' },
  { key: 'category', label: 'Category' },
  { key: 'code', label: 'Nominal code' },
  { key: 'amount', label: 'Amount' },
  { key: 'receipts', label: 'Receipts' },
] as const

/** Minor units as the currency's major units, such as 12.50, for a spreadsheet. */
function major(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 // not-policy: a currency's own digits
  return (minor / 10 ** digits).toFixed(digits) // not-policy: minor units to major
}

/**
 * BC-32: the parent body's schedule, one row per approved item of each claim it pays that is still
 * owed: what it needs to pay and code each line.
 */
export async function parentBodySchedule(actor: Actor): Promise<{ csv: string, claims: number }> {
  const claims = await claimsToPay(actor, 'parent-body')
  const ids = claims.map(c => c.id)
  const items = ids.length
    ? await all<{ claimId: string, approvedMinor: number, category: string | null, code: string | null, receipts: number }>(
        `SELECT i.claim_id AS claimId, i.approved_minor AS approvedMinor, k.name AS category, a.code,
          (SELECT count(*) FROM core_files f WHERE f.owner_type = 'budgets.claim-item' AND f.owner_id = i.id AND f.state = 'ready') AS receipts
        FROM budgets_claim_items i LEFT JOIN budgets_categories k ON k.id = i.category_id LEFT JOIN finance_accounts a ON a.id = k.account_id
        WHERE i.claim_id IN (SELECT value FROM json_each(?)) AND i.approved_minor > 0 ORDER BY i.claim_id, i.sort_order, i.id`, JSON.stringify(ids))
    : []
  const rows = []
  for (const claim of claims) {
    const approvedOn = claim.decidedAt ? await localDate(claim.decidedAt) : ''
    for (const item of items.filter(i => i.claimId === claim.id)) {
      rows.push({ number: claim.number, claimant: claim.claimant, approvedOn, category: item.category ?? '', code: item.code ?? '', amount: major(item.approvedMinor, claim.currency), receipts: item.receipts })
    }
  }
  return { csv: toCsv(rows, SCHEDULE_COLUMNS), claims: claims.length }
}
