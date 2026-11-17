// What Payments tells Front of house about a performance's night (Box office specification, part 5;
// Front of house specification, part 5). Payments does not know what a performance is, so it answers
// by the performance's operating day: two performances on one day show the same till sessions.
import { all } from '#kit'
import { dayBounds, getPerformance, operatingDayOf } from '#modules/core'

export interface DaySession { id: string, pointLabel: string, state: 'open' | 'counting' | 'closed', openedAt: number, closedAt: number | null, expectedCashMinor: number | null, countedCashMinor: number | null, currency: string }

/** The till sessions that were open at any time in the performance's operating day, oldest first. */
export async function sessionsOnNightOf(performanceId: string): Promise<{ day: string, sessions: DaySession[] }> {
  const performance = await getPerformance(performanceId)
  const day = await operatingDayOf(performance.startsAt)
  const { start, end } = await dayBounds(day)
  const rows = await all<{ id: string, point_label: string, state: DaySession['state'], opened_at: number, closed_at: number | null, expected_cash_minor: number | null, counted_cash_minor: number | null, currency: string }>(
    `SELECT id, point_label, state, opened_at, closed_at, expected_cash_minor, counted_cash_minor, currency FROM payments_sessions
      WHERE opened_at < ? AND (closed_at IS NULL OR closed_at >= ?) ORDER BY opened_at, id`, end, start)
  return { day, sessions: rows.map(r => ({ id: r.id, pointLabel: r.point_label, state: r.state, openedAt: r.opened_at, closedAt: r.closed_at, expectedCashMinor: r.expected_cash_minor, countedCashMinor: r.counted_cash_minor, currency: r.currency })) }
}
