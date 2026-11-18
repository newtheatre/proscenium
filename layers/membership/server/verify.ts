// The verifiers Membership ships (tab 4, "Verifiers"; rules V1 to V5, D9). `membership.staff` sends
// every application to the staff queue; `membership.email-domain` passes an account with a verified
// address at one of the scheme's domains; `membership.list` checks the scheme's list. An email list
// is matched only against addresses the account has verified (V4); a reference list against the
// reference they type, and each entry may be claimed by one person only: a second claim waits for
// staff. A failure refuses the request, so nothing is written and the person can try again.
import { all, newId, nowMs, refuse, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findEntry, normalise, schemeList, wellFormed, type ListRow, type Shape } from './lists'
import { verifierConfig, type Scheme } from './schemes'

export interface ListPass { entryId: string, endsOn: string | null }

export type Outcome
  = | { outcome: 'passed', verifier: string, entryId?: string, endsOn?: string | null }
    | { outcome: 'needs-staff' | 'failed', verifier: string, reason: string, entryId?: string }

/** Runs the scheme's verifier for somebody joining. Refuses on a failure; null when nothing is checked. */
export async function runVerifier(scheme: Scheme, accountId: string, reference: string | null | undefined, day: string): Promise<Outcome | null> {
  if (!scheme.verifier) return null
  if (scheme.verifier === 'membership.staff') return { outcome: 'needs-staff', verifier: scheme.verifier, reason: 'staff-check' }
  if (scheme.verifier === 'membership.email-domain') {
    const domains = verifierConfig(scheme).domains ?? []
    const addresses = await verifiedAddresses(accountId)
    if (addresses.some(a => domains.includes(a.slice(a.lastIndexOf('@') + 1)))) return { outcome: 'passed', verifier: scheme.verifier }
    refuse('membership.join.no-address-at-domain', `This membership is for people with an address at ${domains.join(' or ')}.`, { status: 422, remedy: 'Add and verify an address at one of these domains in your account, then try again.' })
  }
  const list = await schemeList(scheme)
  if (!list) refuse('membership.join.not-online', 'This scheme cannot be joined online yet.', { status: 409, remedy: 'Contact the theatre to join.' })
  try {
    const pass = await passList(list!, accountId, reference, day)
    return { outcome: 'passed', verifier: 'membership.list', entryId: pass.entryId, endsOn: pass.endsOn }
  }
  catch (error) {
    // V4: an entry somebody else claimed waits for staff rather than refusing.
    if ((error as { code?: string }).code !== 'membership.join.entry-already-used') throw error
    const entry = await findEntry(list!, reference!, day)
    return { outcome: 'needs-staff', verifier: 'membership.list', reason: 'entry-already-used', entryId: entry?.id }
  }
}

async function verifiedAddresses(accountId: string): Promise<string[]> {
  const rows = await all<{ address: string }>(`SELECT address FROM core_account_emails WHERE verified_at IS NOT NULL AND account_id IN (${accountScopeSql('?1')})`, accountId)
  return rows.map(r => r.address.toLowerCase())
}

/** The row every outcome writes (V1), in the unit that writes the membership. */
export function recordOutcome(unit: UnitView, membershipId: string, outcome: Outcome, decidedBy: string | null = null, note: string | null = null): void {
  unit.add({
    sql: 'INSERT INTO membership_verifications (id, membership_id, verifier, outcome, reason, entry_id, decided_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [newId('mver'), membershipId, outcome.verifier, outcome.outcome, outcome.outcome === 'passed' ? null : outcome.reason, outcome.entryId ?? null, decidedBy, note, nowMs()],
  }).expect(1)
}

/**
 * How a well-formed reference reads, for a message that says what one looks like (V15). A list's
 * label is a whole phrase (V13), the field's own name, so it is never set inside this sentence.
 */
export function shapeText(shape: Shape | null): string {
  if (!shape) return 'Type your reference.'
  const length = shape.min === shape.max ? `${shape.min}` : `${shape.min} to ${shape.max}`
  return `That reference should be ${length} ${shape.kind === 'digits' ? 'digits' : 'letters and digits'}.`
}

/** The entry that lets this account join, or a refusal saying why not. */
export async function passList(list: ListRow, accountId: string, reference: string | null | undefined, day: string): Promise<ListPass> {
  const help = String(await useSetting('membership.help.link') ?? '') || undefined
  let entry: Awaited<ReturnType<typeof findEntry>> = null
  if (list.keyKind === 'email') {
    for (const address of await verifiedAddresses(accountId)) {
      entry = await findEntry(list, address, day)
      if (entry) break
    }
    if (!entry) refuse('membership.join.not-on-list', 'We could not find a membership for any of your verified email addresses. Have a membership? Contact us.', { status: 422, remedy: help })
  }
  else {
    if (!reference) refuse('membership.join.needs-reference', 'Type your reference.', { status: 422, fields: { reference: 'membership.join.needs-reference' } })
    if (!wellFormed(list.referenceShape, normalise('reference', reference!)))
      refuse('membership.join.not-well-formed', shapeText(list.referenceShape), { status: 422, fields: { reference: 'membership.join.not-well-formed' } })
    entry = await findEntry(list, reference!, day)
    // V15: the miss speaks of the membership, not the ID.
    if (!entry) refuse('membership.join.not-on-list', 'We could not find a current membership with that reference. Have a membership? Contact us.', { status: 422, remedy: help, fields: { reference: 'membership.join.not-on-list' } })
  }
  if (entry!.usedBy) {
    const ours = await all<{ id: string }>(`SELECT id FROM membership_memberships WHERE id = ?1 AND account_id IN (${accountScopeSql('?2')})`, entry!.usedBy, accountId)
    // V4: somebody else claimed it. Staff settle that; the application queue is a later slice.
    if (!ours.length) refuse('membership.join.entry-already-used', 'That reference has already been used to join. Contact us and we will sort it out.', { status: 409, remedy: help })
  }
  return { entryId: entry!.id, endsOn: entry!.endsOn }
}

/** Claims the entry for the new membership and records the check. In the joining unit. */
export function recordPass(unit: UnitView, membershipId: string, accountId: string, pass: ListPass): void {
  unit.add({
    sql: `UPDATE membership_verification_entries SET used_by = ?1 WHERE id = ?2 AND (used_by IS NULL OR used_by IN (SELECT id FROM membership_memberships WHERE account_id IN (${accountScopeSql('?3')})))`,
    params: [membershipId, pass.entryId, accountId],
  }).expect(1, { code: 'membership.join.entry-already-used', reason: 'That reference has just been used to join by somebody else.', remedy: 'Contact us and we will sort it out.' })
  recordOutcome(unit, membershipId, { outcome: 'passed', verifier: 'membership.list', entryId: pass.entryId })
}
