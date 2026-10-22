import { londonParts } from '#shared/utils/london'

// Domain dates are London days (0014); a UTC date is London's yesterday from 23:00 to 00:00 UTC in summer.
const asDay = (at: Date): string => at.toISOString().slice(0, 10)

function londonNoon(days = 0, years = 0): Date {
  const { year, month, day } = londonParts(new Date())
  return new Date(Date.UTC(year + years, month - 1, day + days, 12))
}

export const londonToday = (): string => asDay(londonNoon())

export const londonDaysFrom = (days: number): string => asDay(londonNoon(days))

export const londonYearsFrom = (years: number): string => asDay(londonNoon(0, years))

// The first London day on or after `days` from today that falls on `weekday` (0 is Sunday).
export function londonWeekdayFrom(days: number, weekday: number): string {
  const at = londonNoon(days)
  while (at.getUTCDay() !== weekday) at.setUTCDate(at.getUTCDate() + 1)
  return asDay(at)
}
