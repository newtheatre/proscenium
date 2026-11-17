// Ending a membership (tab 4, "Ending"; E1 to E3): a guarded update from active or pending. It ends
// today: it stops counting at once, because only an active membership is current, and the members'
// area follows at the next request. An ended membership is never reopened.
import { nowMs, type UnitView } from '#kit'

export function endMembership(unit: UnitView, input: { id: string, reason: 'by-holder' | 'by-staff', by: string, note?: string | null }): void {
  const at = nowMs()
  unit.add({
    sql: 'UPDATE membership_memberships SET state = \'ended\', end_reason = ?, ended_at = ?, ended_by = ?, note = coalesce(?, note), updated_at = ? WHERE id = ? AND state IN (\'active\', \'pending\')',
    params: [input.reason, at, input.by, input.note ?? null, at, input.id],
  }).expect(1, { code: 'membership.membership.already-ended', reason: 'This membership has already ended.', remedy: 'Reload the page.' })
  unit.audit({ action: 'state', record: ['membership.membership', input.id], detail: { to: 'ended', reason: input.reason } })
}
