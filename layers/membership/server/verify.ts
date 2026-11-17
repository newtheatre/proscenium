// The list verifier (tab 4, "Verifiers"; rules V1 to V5, D9): checks somebody joining against the
// scheme's list. An email list is matched only against addresses the account has verified (V4); a
// reference list against the reference they type, and each entry may be claimed by one person only.
import { all, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findEntry, normalise, wellFormed, type ListRow, type Shape } from './lists'

export interface ListPass { entryId: string, endsOn: string | null }

/** How a well-formed reference reads, for a message that says what one looks like (V15). */
export function shapeText(label: string, shape: Shape | null): string {
  if (!shape) return `Enter your ${label}.`
  const length = shape.min === shape.max ? `${shape.min}` : `${shape.min} to ${shape.max}`
  return `Your ${label} is ${length} ${shape.kind === 'digits' ? 'digits' : 'letters and digits'}.`
}

/** The entry that lets this account join, or a refusal saying why not. */
export async function passList(list: ListRow, accountId: string, reference: string | null | undefined, day: string): Promise<ListPass> {
  const help = String(await useSetting('membership.help.link') ?? '') || undefined
  const label = list.referenceLabel ?? 'reference'
  let entry: Awaited<ReturnType<typeof findEntry>> = null
  if (list.keyKind === 'email') {
    const addresses = await all<{ address: string }>(`SELECT address FROM core_account_emails WHERE verified_at IS NOT NULL AND account_id IN (${accountScopeSql('?1')})`, accountId)
    for (const { address } of addresses) {
      entry = await findEntry(list, address, day)
      if (entry) break
    }
    if (!entry) refuse('membership.join.not-on-list', 'We could not find a membership for any of your verified email addresses. Have a membership? Contact us.', { status: 422, remedy: help })
  }
  else {
    if (!reference) refuse('membership.join.needs-reference', `Enter your ${label}.`, { status: 422, fields: { reference: 'membership.join.needs-reference' } })
    if (!wellFormed(list.referenceShape, normalise('reference', reference!)))
      refuse('membership.join.not-well-formed', shapeText(label, list.referenceShape), { status: 422, fields: { reference: 'membership.join.not-well-formed' } })
    entry = await findEntry(list, reference!, day)
    // V15: the miss speaks of the membership, not the ID.
    if (!entry) refuse('membership.join.not-on-list', `We could not find a membership for that ${label}. Have a membership? Contact us.`, { status: 422, remedy: help, fields: { reference: 'membership.join.not-on-list' } })
  }
  if (entry!.usedBy) {
    const ours = await all<{ id: string }>(`SELECT id FROM membership_memberships WHERE id = ?1 AND account_id IN (${accountScopeSql('?2')})`, entry!.usedBy, accountId)
    // V4: somebody else claimed it. Staff settle that; the application queue is a later slice.
    if (!ours.length) refuse('membership.join.entry-already-used', `That ${label} has already been used to join. Contact us and we will sort it out.`, { status: 409, remedy: help })
  }
  return { entryId: entry!.id, endsOn: entry!.endsOn }
}

/** Claims the entry for the new membership and records the check. In the joining unit. */
export function recordPass(unit: UnitView, membershipId: string, accountId: string, pass: ListPass): void {
  unit.add({
    sql: `UPDATE membership_verification_entries SET used_by = ?1 WHERE id = ?2 AND (used_by IS NULL OR used_by IN (SELECT id FROM membership_memberships WHERE account_id IN (${accountScopeSql('?3')})))`,
    params: [membershipId, pass.entryId, accountId],
  }).expect(1, { code: 'membership.join.entry-already-used', reason: 'That reference has just been used to join by somebody else.', remedy: 'Contact us and we will sort it out.' })
  unit.add({
    sql: 'INSERT INTO membership_verifications (id, membership_id, verifier, outcome, reason, entry_id, created_at) VALUES (?, ?, \'membership.list\', \'passed\', NULL, ?, ?)',
    params: [newId('mver'), membershipId, pass.entryId, nowMs()],
  }).expect(1)
}
