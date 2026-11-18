// An application form attached to a scheme reached its approved or declined stage (MEM-16, AP2).
// Approving sets approved_at and activates the membership when nothing else is outstanding (A1); a
// fee still unpaid now waits on the applicant, so its clock starts (J5). Declining is final, as a
// staff decline is: a fee paid later is refused and refunded (P5).
import { defineListener, first, nowMs, today, useSetting } from '#kit'
import { activatePending } from '../memberships'
import { requireScheme } from '../schemes'

export default defineListener(async (event, unit) => {
  const { responseId, outcome } = event.payload as { responseId: string, outcome: 'approved' | 'declined' }
  const row = await first<{ id: string, account_id: string, scheme_id: string, needs_verification: number, verified_at: number | null, needs_payment: number, paid_at: number | null, approved_at: number | null, count: number | null, entry_ends: string | null }>(
    `SELECT m.id, m.account_id, m.scheme_id, m.needs_verification, m.verified_at, m.needs_payment, m.paid_at, m.approved_at, o.count,
            (SELECT e.ends_on FROM membership_verifications v JOIN membership_verification_entries e ON e.id = v.entry_id WHERE v.membership_id = m.id AND v.outcome = 'passed' ORDER BY v.created_at DESC LIMIT 1) AS entry_ends
       FROM membership_memberships m LEFT JOIN membership_length_options o ON o.id = m.length_option_id
      WHERE m.response_id = ? AND m.state = 'pending' AND m.needs_approval = 1`,
    responseId,
  )
  // Not an application, or one already withdrawn, expired or dealt with.
  if (!row || row.approved_at !== null) return
  const at = nowMs()
  if (outcome === 'declined') {
    unit.add({ sql: 'UPDATE membership_memberships SET state = \'declined\', updated_at = ? WHERE id = ? AND state = \'pending\'', params: [at, row.id] })
    unit.audit({ action: 'state', record: ['membership.membership', row.id], detail: { to: 'declined', by: 'application-form' } })
    return
  }
  const unchecked = !!row.needs_verification && row.verified_at === null
  const unpaid = !!row.needs_payment && row.paid_at === null
  if (unchecked || unpaid) {
    const expiresAt = !unchecked && unpaid ? at + (await useSetting('membership.applications.expire-after') as number) * 1000 : null // not-policy: seconds to milliseconds
    unit.add({ sql: 'UPDATE membership_memberships SET approved_at = ?, expires_at = ?, updated_at = ? WHERE id = ? AND state = \'pending\'', params: [at, expiresAt, at, row.id] })
    unit.audit({ action: 'update', record: ['membership.membership', row.id], detail: { approved: true } })
    return
  }
  unit.add({ sql: 'UPDATE membership_memberships SET approved_at = ? WHERE id = ? AND state = \'pending\'', params: [at, row.id] })
  const scheme = await requireScheme(row.scheme_id)
  await activatePending(unit, {
    id: row.id, scheme, accountId: row.account_id, count: row.count ?? 1, startsOn: await today(),
    ...(row.entry_ends ? { endsOn: row.entry_ends } : {}),
  })
  unit.audit({ action: 'state', record: ['membership.membership', row.id], detail: { to: 'active' } })
})
