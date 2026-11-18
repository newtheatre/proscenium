// Passes or declines an application waiting on a check (V2, V3). Passing activates it at once when
// nothing else is outstanding (A1): its dates start today, or end on the list entry's date (D9).
// Declining is final; the person may apply again. Every decision is a verification row.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, nowMs, refuse, today, useSetting } from '#kit'
import { activatePending } from '../../../../memberships'
import { requireScheme } from '../../../../schemes'
import { recordOutcome } from '../../../../verify'

export default defineRoute({
  ability: 'membership.membership.verify',
  record: event => ['membership.membership', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    outcome: z.enum(['pass', 'decline']),
    note: z.string().trim().max(500).nullish(), // not-policy: the bound of a staff note
  }),
}, async (_event, { input, actor, record, unit }) => {
  const row = await first<{ account_id: string, scheme_id: string, state: string, needs_approval: number, approved_at: number | null, needs_payment: number, paid_at: number | null, count: number | null, entry_ends: string | null, verifier: string | null }>(
    `SELECT m.account_id, m.scheme_id, m.state, m.needs_approval, m.approved_at, m.needs_payment, m.paid_at, o.count,
            (SELECT e.ends_on FROM membership_verifications v JOIN membership_verification_entries e ON e.id = v.entry_id WHERE v.membership_id = m.id ORDER BY v.created_at DESC LIMIT 1) AS entry_ends,
            (SELECT v.verifier FROM membership_verifications v WHERE v.membership_id = m.id ORDER BY v.created_at DESC LIMIT 1) AS verifier
       FROM membership_memberships m LEFT JOIN membership_length_options o ON o.id = m.length_option_id WHERE m.id = ?`,
    record!.id,
  )
  if (!row) refuse('core.not-found', 'There is no such application.', { status: 404 })
  if (row!.state !== 'pending') refuse('membership.application.changed', 'This application has already been dealt with.', { status: 409, remedy: 'Reload the page.' })
  const verifier = row!.verifier ?? 'membership.staff'
  const note = input.note || null
  if (input.outcome === 'decline') {
    unit.add({ sql: 'UPDATE membership_memberships SET state = \'declined\', updated_at = ? WHERE id = ? AND state = \'pending\'', params: [nowMs(), record!.id] })
      .expect(1, { code: 'membership.application.changed', reason: 'This application has already been dealt with.', remedy: 'Reload the page.' })
    recordOutcome(unit, record!.id, { outcome: 'failed', verifier, reason: 'declined-by-staff' }, actor.accountId, note)
    unit.audit({ action: 'state', record: ['membership.membership', record!.id], detail: { to: 'declined' } })
    return { state: 'declined' }
  }
  recordOutcome(unit, record!.id, { outcome: 'passed', verifier }, actor.accountId, note)
  // An entry nobody has claimed (its name differed from the applicant's) is claimed on passing.
  unit.add({
    sql: 'UPDATE membership_verification_entries SET used_by = ?1 WHERE used_by IS NULL AND id = (SELECT entry_id FROM membership_verifications WHERE membership_id = ?1 AND entry_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1)',
    params: [record!.id],
  })
  // A2: with the fee still to pay, the applicant is now asked to pay, and the application expires if
  // they do not (J5). One still waiting for its application form's decision waits without a clock.
  const unpaid = !!row!.needs_payment && row!.paid_at === null
  const unapproved = !!row!.needs_approval && row!.approved_at === null
  if (unapproved || unpaid) {
    const at = nowMs()
    const expiresAt = unpaid && !unapproved ? at + (await useSetting('membership.applications.expire-after') as number) * 1000 : null // not-policy: seconds to milliseconds
    unit.add({ sql: 'UPDATE membership_memberships SET verified_at = ?, expires_at = ?, updated_at = ? WHERE id = ? AND state = \'pending\'', params: [at, expiresAt, at, record!.id] }).expect(1)
    return { state: 'pending', waiting: unapproved ? 'approval' : 'payment' }
  }
  const scheme = await requireScheme(row!.scheme_id)
  const dates = await activatePending(unit, {
    id: record!.id, scheme, accountId: row!.account_id, count: row!.count ?? 1, startsOn: await today(),
    ...(row!.entry_ends ? { endsOn: row!.entry_ends } : {}),
  })
  unit.audit({ action: 'state', record: ['membership.membership', record!.id], detail: { to: 'active' } })
  return { state: 'active', ...dates }
})
