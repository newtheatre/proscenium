// Arriving once (part 3, "Check-in"; FH-21): doing a job of the night on your own shift is arriving,
// so nobody is asked to say "I'm here" after they have already opened the house.
import { all, nowMs, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { sql } from 'drizzle-orm'

/**
 * Checks the person in on their own places at this performance, inside the window, when they have
 * not arrived yet. Never refuses: someone with no place tonight, or marked not coming, is left alone.
 */
export async function arriveByActing(unit: UnitView, input: { performanceId: string, accountId: string, when?: number }): Promise<void> {
  const at = nowMs()
  const due = await all<{ id: string, state: string }>(
    `SELECT a.id, a.state FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.performance_id = ?2 AND s.state = 'published' AND ?3 BETWEEN s.window_opens_at AND s.window_closes_at -- not-policy: numbered parameters
        AND a.state IN ('confirmed', 'release_requested') AND a.account_id IN (${accountScopeSql('?1')})`, input.accountId, input.performanceId, at)
  const when = Math.min(input.when ?? at, at)
  for (const row of due) {
    unit.add(sql`UPDATE front_of_house_assignments
      SET state = 'checked_in', updated_at = ${at},
        checked_in_at = coalesce(checked_in_at, max(${when}, (SELECT s.window_opens_at FROM front_of_house_shifts s WHERE s.id = shift_id)))
      WHERE id = ${row.id} AND state IN ('confirmed', 'release_requested')`)
    unit.audit({ action: 'state', record: ['front-of-house.assignment', row.id], detail: { from: row.state, to: 'checked_in', implied: true } })
  }
}
