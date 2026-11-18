// What Payments tells Front of house about a performance's night (Box office specification, part 5;
// Front of house specification, part 5). Payments does not know what a performance is, so it answers
// by the performance's operating day: two performances on one day show the same till sessions.
import { all, first } from '#kit'
import { dayBounds, getPerformance, operatingDayOf, placeName } from '#modules/core'

/** pointLabel names the till as a person reads it: its place and note, or a key saying it is unknown. */
export interface DaySession { id: string, pointLabel: string, state: 'open' | 'counting' | 'closed', openedAt: number, closedAt: number | null, expectedCashMinor: number | null, countedCashMinor: number | null, currency: string }

/** The till sessions that were open at any time in the performance's operating day, oldest first. */
export async function sessionsOnNightOf(performanceId: string): Promise<{ day: string, sessions: DaySession[] }> {
  const performance = await getPerformance(performanceId)
  const day = await operatingDayOf(performance.startsAt)
  const { start, end } = await dayBounds(day)
  const rows = await all<{ id: string, point_label: string, space_id: string | null, state: DaySession['state'], opened_at: number, closed_at: number | null, expected_cash_minor: number | null, counted_cash_minor: number | null, currency: string }>(
    `SELECT id, point_label, space_id, state, opened_at, closed_at, expected_cash_minor, counted_cash_minor, currency FROM payments_sessions
      WHERE opened_at < ? AND (closed_at IS NULL OR closed_at >= ?) ORDER BY opened_at, id`, end, start)
  const label = async (r: typeof rows[number]) => [r.space_id ? await placeName(r.space_id) : null, r.point_label].filter(Boolean).join(' · ') || 'payments.report.unknown-till'
  return { day, sessions: await Promise.all(rows.map(async r => ({ id: r.id, pointLabel: await label(r), state: r.state, openedAt: r.opened_at, closedAt: r.closed_at, expectedCashMinor: r.expected_cash_minor, countedCashMinor: r.counted_cash_minor, currency: r.currency }))) }
}

/** What the tills open in the performance's operating day have taken: the payments that went through there, before any refund. */
export async function takingsOnNightOf(performanceId: string): Promise<{ amountMinor: number, currency: string | null }> {
  const { sessions } = await sessionsOnNightOf(performanceId)
  if (!sessions.length) return { amountMinor: 0, currency: null }
  const row = await first<{ amount: number | null }>(
    `SELECT sum(amount_minor) AS amount FROM payments_intents WHERE state = 'succeeded' AND session_id IN (${sessions.map(() => '?').join(', ')})`, ...sessions.map(s => s.id))
  return { amountMinor: Number(row?.amount ?? 0), currency: sessions[0]!.currency }
}
