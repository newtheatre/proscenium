import { committeeYearOf } from './london'
import { saysMonth } from './when'

// The year a treasurer means by "now" (I-105 criterion 4): 1 August to 31 July, named by the
// year it ends in, same rule as the committee year (0009). Never a season, which is a row (0087).
export function currentYear(): number {
  return committeeYearOf(new Date())
}

// How far back the money screens offer to look. A control's length, not a policy number (0012).
export const YEARS_OFFERED = 6

export interface Choice<T> { label: string, value: T }

// The two calendar years a year spans. The second is shortened only where the century does not
// turn, so 2099/2100 still reads as two years rather than as 2099/00.
export function saysYear(year: number): string {
  const began = year - 1
  return Math.floor(began / 100) === Math.floor(year / 100)
    ? `${began}/${String(year).slice(-2)}`
    : `${began}/${year}`
}

// Newest first: a treasurer means this year unless they say otherwise (K-123 criterion 2).
export function yearChoices(latest: number, count = YEARS_OFFERED): Choice<number>[] {
  return Array.from({ length: count }, (_, back) => ({
    label: saysYear(latest - back),
    value: latest - back,
  }))
}

// A month's year is a calendar year, not a 1 August one, so it is offered as one: "2026", not
// "2025/26". Newest first, the same depth as the years.
export function calendarYearChoices(latest: number, count = YEARS_OFFERED): Choice<number>[] {
  return Array.from({ length: count }, (_, back) => ({ label: String(latest - back), value: latest - back }))
}

// Numbered the way `periodForm` takes a month; the names come from the one date mechanism.
export function monthChoices(): Choice<number>[] {
  return Array.from({ length: 12 }, (_, index) => ({ label: saysMonth(index + 1), value: index + 1 }))
}
