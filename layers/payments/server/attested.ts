// The two halves shared by money a person attests to after the fact (taken outside the site, or
// received in the bank): the Other attempt marked succeeded, and the owner's entries posted against
// that payment-method account's clearing, with the intent announced.
import { newId, Refusal, type UnitView } from '#kit'
import { postEntries, type EntryInput } from '#modules/finance'
import type { OwnerEntry } from './points/settlement'
import { clearingFor } from './providers'
import { ownerEntries } from './owner-entries'

/** The attempt has its answer: succeeded, from the person who recorded it. */
export function attestSucceeded(unit: UnitView, attemptId: string, by: string, at: number): void {
  unit.add({
    sql: "UPDATE payments_attempts SET state = 'succeeded', answered_by = ?, answered_at = ?, updated_at = ? WHERE id = ? AND state = 'started'",
    params: [by, at, at, attemptId],
  }).expect(1, { code: 'payments.attempt.already-answered', reason: 'This payment already has its answer.' })
  unit.add({ sql: "INSERT INTO payments_attempt_events (id, attempt_id, kind, source, by, at) VALUES (?, ?, 'attested_succeeded', 'person', ?, ?)", params: [newId('ate'), attemptId, by, at] })
}

export interface AttestedSale {
  intentId: string
  owner: { module: string, record: string }
  amountMinor: number
  currency: string
  providerAccountId: string
  by: string
  occurredAt?: number
  /** What the audit entry says this was, such as { outside: 1500 }. */
  detail: Record<string, number>
}

/** Posts the owner's entries for one attested part and announces the intent succeeded. */
export async function postAttested(unit: UnitView, sale: AttestedSale, own: OwnerEntry[]): Promise<void> {
  const total = own.reduce((sum, e) => sum + e.amountMinor, 0)
  if (total !== -sale.amountMinor) throw new Refusal('payments.settlement.part-mismatch', `${sale.owner.module}'s entries for this payment total ${-total}, not ${sale.amountMinor}.`, { status: 500 })
  const entries: EntryInput[] = await ownerEntries(own, sale.owner.module)
  await postEntries(unit, {
    key: `payments:intent:${sale.intentId}:paid`,
    source: { module: 'payments', type: 'payments.intent', id: sale.intentId },
    kind: 'sale',
    currency: sale.currency,
    postedBy: sale.by,
    occurredAt: sale.occurredAt,
    entries: [{ account: clearingFor('other_attested', sale.providerAccountId), amountMinor: sale.amountMinor }, ...entries],
  })
  unit.audit({ action: 'create', record: ['payments.intent', sale.intentId], detail: sale.detail })
  unit.announce('payments.intent.succeeded', { intentId: sale.intentId, owners: [{ moduleId: sale.owner.module, recordId: sale.owner.record }] }, { record: ['payments.intent', sale.intentId] })
}
