import { fromLondonWallClock } from './london'

// D-129: a season report over `tickets`, filtered by show, performance, date range and source.
// A structural bound rather than a policy one, so it is a constant and not a setting (0012).
export const TICKET_EXPORT_CAP = 20_000

// A season is named by the year it ends in, matching `committeeYearOf`. SEASON_START and
// SEASON_END are MM-DD, already validated as a real day of every year (config-rules.ts).
export function resolveSeasonBounds(year: number, seasonStart: string, seasonEnd: string): { fromAt: number, toAt: number } {
  const [startMonth, startDay] = seasonStart.split('-').map(Number) as [number, number]
  const [endMonth, endDay] = seasonEnd.split('-').map(Number) as [number, number]

  const fromAt = Math.floor(fromLondonWallClock(year - 1, startMonth, startDay).getTime() / 1000)
  // The last instant of the end day, then +1 makes the bound exclusive like every other range here.
  const toAt = Math.floor(fromLondonWallClock(year, endMonth, endDay, 23, 59, 59, 999).getTime() / 1000) + 1
  return { fromAt, toAt }
}
