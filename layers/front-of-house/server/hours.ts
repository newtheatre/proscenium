// Volunteer hours (part 3, "Volunteer hours"; FH-34): worked assignments by date range, with totals.
// Read under hours.view, which is audited on read. Front of house never reads the accounts table:
// names come from the core's accountLabel. A merge moves assignments to the survivor, so each person
// is one row.
import { all, theatreTimeZone } from '#kit'
import { instantOfLocal, previousDate } from '#kit/clock'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel } from '#modules/core'

export interface HoursFilter { from: number, to: number, accountId?: string, dutyId?: string }
/** The range a query names, in milliseconds: given directly, or as the theatre's days, both ends included. */
export async function hoursRange(q: { from?: number, to?: number, fromDay?: string, toDay?: string, accountId?: string, dutyId?: string }): Promise<HoursFilter> {
  if (q.from !== undefined && q.to !== undefined) return { from: q.from, to: q.to, accountId: q.accountId, dutyId: q.dutyId }
  const zone = await theatreTimeZone()
  return { from: instantOfLocal(q.fromDay!, '00:00', zone), to: instantOfLocal(previousDate(q.toDay!, -1), '00:00', zone), accountId: q.accountId, dutyId: q.dutyId }
}

export interface HoursRow { accountId: string, name: string, shiftsWorked: number, minutes: number, noShows: number }

/** Minutes worked, grouped by person, for shifts whose call time falls in [from, to). */
export async function hoursWorked(filter: HoursFilter): Promise<{ rows: HoursRow[], totalMinutes: number }> {
  // Every numbered parameter is used whichever filters are given, as D1 asks.
  const where = ['s.call_at >= ?2', 's.call_at < ?3', `(?1 IS NULL OR a.account_id IN (${accountScopeSql('?1')}))`, '(?4 IS NULL OR s.duty_id = ?4)']
  const rows = await all<{ account_id: string, worked: number, minutes: number, no_shows: number }>(
    `SELECT a.account_id,
        sum(a.state = 'worked') AS worked, coalesce(sum(CASE WHEN a.state = 'worked' THEN a.minutes_worked END), 0) AS minutes, sum(a.state = 'no_show') AS no_shows
      FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
     WHERE a.state IN ('worked', 'no_show') AND ${where.join(' AND ')}
     GROUP BY 1 ORDER BY minutes DESC`, filter.accountId ?? null, filter.from, filter.to, filter.dutyId ?? null)
  const out = await Promise.all(rows.map(async r => ({ accountId: r.account_id, name: await accountLabel(r.account_id), shiftsWorked: r.worked, minutes: r.minutes, noShows: r.no_shows })))
  return { rows: out, totalMinutes: out.reduce((n, r) => n + r.minutes, 0) }
}

/** The same as a CSV file, for the export. */
export function hoursCsv(rows: HoursRow[]): string {
  const cell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const lines = [['Name', 'Shifts worked', 'Hours', 'No-shows'], ...rows.map(r => [r.name, r.shiftsWorked, (r.minutes / 60).toFixed(2), r.noShows])] // not-policy: minutes to hours
  return lines.map(l => l.map(cell).join(',')).join('\n') + '\n'
}
