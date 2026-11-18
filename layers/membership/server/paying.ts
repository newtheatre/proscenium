// The membership's side of a paid fee (rules A1, A2, P4, P7). The fees module calls these from
// inside Payments' settle and refund batches, so the money, the ledger and the membership change
// together or not at all.
import { first, nowMs, refuse, today, type UnitView } from '#kit'
import { activatePending } from './memberships'
import { renewalStarts } from './renewal'
import { requireScheme } from './schemes'

/**
 * P4: sets paid_at and, when nothing else is outstanding, activates under A1. Its dates start today,
 * or on the day after the membership it renews ends (R2), or end on the list entry's date (D9).
 * Refuses unless the membership is still waiting, so a payment that lands after an application
 * expired or was withdrawn settles nothing and is refunded by Payments (P5). A fee waived by staff
 * (P9) passes the reason as the membership's note.
 */
export async function markPaid(unit: UnitView, membershipId: string, options: { note?: string } = {}): Promise<{ state: 'active' | 'pending' }> {
  const row = await first<{ account_id: string, scheme_id: string, state: string, needs_verification: number, verified_at: number | null, needs_approval: number, approved_at: number | null, paid_at: number | null, count: number | null, renewed_ends: string | null, entry_ends: string | null }>(
    `SELECT m.account_id, m.scheme_id, m.state, m.needs_verification, m.verified_at, m.needs_approval, m.approved_at, m.paid_at, o.count,
            (SELECT r.ends_on FROM membership_memberships r WHERE r.id = m.renews_id) AS renewed_ends,
            (SELECT e.ends_on FROM membership_verifications v JOIN membership_verification_entries e ON e.id = v.entry_id WHERE v.membership_id = m.id AND v.outcome = 'passed' ORDER BY v.created_at DESC LIMIT 1) AS entry_ends
       FROM membership_memberships m LEFT JOIN membership_length_options o ON o.id = m.length_option_id WHERE m.id = ?`,
    membershipId,
  )
  if (!row || row.state !== 'pending' || row.paid_at !== null)
    refuse('membership.pay.not-waiting', 'This membership is no longer waiting for its fee.', { status: 409 })
  const at = nowMs()
  if (options.note) unit.add({ sql: 'UPDATE membership_memberships SET note = ? WHERE id = ?', params: [options.note, membershipId] })
  const ready = (!row!.needs_verification || row!.verified_at !== null) && (!row!.needs_approval || row!.approved_at !== null)
  if (!ready) {
    unit.add({ sql: 'UPDATE membership_memberships SET paid_at = ?, expires_at = NULL, updated_at = ? WHERE id = ? AND state = \'pending\' AND paid_at IS NULL', params: [at, at, membershipId] })
      .expect(1, { code: 'membership.pay.not-waiting', reason: 'This membership is no longer waiting for its fee.' })
    return { state: 'pending' }
  }
  const scheme = await requireScheme(row!.scheme_id)
  const day = await today()
  await activatePending(unit, {
    id: membershipId, scheme, accountId: row!.account_id, count: row!.count ?? 1, paid: true,
    startsOn: row!.renewed_ends ? renewalStarts(row!.renewed_ends, day) : day,
    ...(row!.entry_ends ? { endsOn: row!.entry_ends } : {}),
  })
  return { state: 'active' }
}

/** P7: a full refund ends the membership with reason `refunded`, today. Nothing if it has already ended. */
export function endRefunded(unit: UnitView, membershipId: string): void {
  const at = nowMs()
  unit.add({
    sql: 'UPDATE membership_memberships SET state = \'ended\', end_reason = \'refunded\', ended_at = ?, updated_at = ? WHERE id = ? AND state IN (\'active\', \'pending\')',
    params: [at, at, membershipId],
  })
  unit.audit({ action: 'state', record: ['membership.membership', membershipId], detail: { to: 'ended', reason: 'refunded' } })
}
