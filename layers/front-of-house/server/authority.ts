// The three facts (part 3, "The three facts"; FH-02, FH-03). Each is a pure read of stored times,
// through the account scope, so a merged person is on shift once and every screen gets one answer.
// Nothing is cached beyond the request: losing a fact takes effect on the next request.
import { all, first, nowMs } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { AUTHORITY_STATES, LIVE_STATES } from './db/schema'

const quoted = (states: readonly string[]) => states.map(s => `'${s}'`).join(', ')
const AUTHORITY = quoted(AUTHORITY_STATES)
const LIVE = quoted(LIVE_STATES)

export interface Holding { holds: boolean, until?: number, performanceId?: string, assignmentId?: string }

/**
 * Whether the account is on shift now: a confirmed (or release-requested, or checked-in) assignment
 * on a published shift of the performance, with now inside the window. With no performance, on
 * shift for any. `lead` narrows it to a lead duty. `until` is just after the window closes.
 */
export async function onShift(accountId: string, performanceId?: string, options: { lead?: boolean } = {}): Promise<Holding> {
  const row = await first<{ id: string, performance_id: string, window_closes_at: number }>(
    `SELECT a.id, s.performance_id, s.window_closes_at FROM front_of_house_assignments a
       JOIN front_of_house_shifts s ON s.id = a.shift_id
       ${options.lead ? 'JOIN front_of_house_duties d ON d.id = s.duty_id AND d.is_lead = 1' : ''}
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${AUTHORITY})
        AND s.state = 'published' AND s.performance_id IS NOT NULL AND (?2 IS NULL OR s.performance_id = ?2)
        AND ?3 BETWEEN s.window_opens_at AND s.window_closes_at -- not-policy: numbered parameters
      ORDER BY s.window_closes_at DESC LIMIT 1`,
    accountId, performanceId ?? null, nowMs())
  // The window is inclusive and the kit's `until` is the first moment the fact no longer holds.
  return row ? { holds: true, until: row.window_closes_at + 1, performanceId: row.performance_id, assignmentId: row.id } : { holds: false }
}

/** The accounts on shift now, for one performance or any. */
export async function onShiftHolders(performanceId?: string, options: { lead?: boolean } = {}): Promise<string[]> {
  const rows = await all<{ account_id: string }>(
    `SELECT DISTINCT a.account_id FROM front_of_house_assignments a
       JOIN front_of_house_shifts s ON s.id = a.shift_id
       ${options.lead ? 'JOIN front_of_house_duties d ON d.id = s.duty_id AND d.is_lead = 1' : ''}
      WHERE a.state IN (${AUTHORITY}) AND s.state = 'published' AND s.performance_id IS NOT NULL
        AND (?1 IS NULL OR s.performance_id = ?1) AND ?2 BETWEEN s.window_opens_at AND s.window_closes_at
      ORDER BY a.account_id`,
    performanceId ?? null, nowMs())
  return rows.map(r => r.account_id)
}

/**
 * Whether the account has a live assignment (requested included) on any shift whose window has not
 * closed, a shift not tied to a performance included. Opens the members' area, and nothing else.
 */
export async function rostered(accountId: string): Promise<Holding> {
  const row = await first<{ until: number }>(
    `SELECT max(s.window_closes_at) AS until FROM front_of_house_assignments a
       JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE a.account_id IN (${accountScopeSql('?1')}) AND a.state IN (${LIVE})
        AND s.state IN ('draft', 'published') AND s.window_closes_at >= ?2`,
    accountId, nowMs())
  return row?.until ? { holds: true, until: row.until + 1 } : { holds: false }
}

export async function rosteredHolders(): Promise<string[]> {
  const rows = await all<{ account_id: string }>(
    `SELECT DISTINCT a.account_id FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE a.state IN (${LIVE}) AND s.state IN ('draft', 'published') AND s.window_closes_at >= ? ORDER BY a.account_id`,
    nowMs())
  return rows.map(r => r.account_id)
}

/** The performance a record belongs to, for a fact asked on a shift or an assignment. */
export async function performanceOf(record?: { type: string, id: string }): Promise<string | null | undefined> {
  if (!record) return undefined
  if (record.type === 'core.performance') return record.id
  if (record.type === 'front-of-house.shift')
    return (await first<{ performance_id: string | null }>('SELECT performance_id FROM front_of_house_shifts WHERE id = ?', record.id))?.performance_id ?? null
  if (record.type === 'front-of-house.assignment')
    return (await first<{ performance_id: string | null }>('SELECT s.performance_id FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id WHERE a.id = ?', record.id))?.performance_id ?? null
  return null
}
