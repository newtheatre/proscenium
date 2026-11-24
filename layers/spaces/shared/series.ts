// The dates a series falls on (spec part 3, rules R2, R3 and R8): worked out on calendar dates,
// never instants, so a series keeps its wall-clock time across a clock change.
import type { FREQUENCIES } from './states'

export type Frequency = typeof FREQUENCIES[number]

const DAY = 86_400_000 // not-policy: unit of time

const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10) // not-policy: YYYY-MM-DD
/** ISO weekday, Monday 1 to Sunday 7. */
export const weekdayOf = (date: string) => ((new Date(parse(date)).getUTCDay() + 6) % 7) + 1 // not-policy: Sunday is 0 in JavaScript, 7 here

/**
 * Every date from `first` to `last` inclusive the series falls on. Weekly and fortnightly take
 * weekdays (1 to 7); with none, the first date's. Fortnightly counts weeks from the first date's
 * Monday. Monthly is the first date's weekday in the same week of the month, and a month without
 * a fifth one is skipped (R8). `limit` stops the expansion early, so a long range costs nothing.
 */
export function seriesDates(input: { frequency: Frequency, first: string, last: string, weekdays?: number[] | null }, limit = Infinity): string[] {
  const start = parse(input.first)
  const end = parse(input.last)
  const out: string[] = []
  if (end < start) return out
  if (input.frequency === 'monthly-by-weekday') {
    const first = new Date(start)
    const weekday = first.getUTCDay()
    const nth = Math.ceil(first.getUTCDate() / 7) // not-policy: weeks of a month
    for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); out.length < limit; m++) {
      const opening = new Date(Date.UTC(y, m, 1))
      const day = 1 + ((weekday - opening.getUTCDay() + 7) % 7) + (nth - 1) * 7 // not-policy: days of a week
      const at = Date.UTC(y, m, day)
      if (at > end) break
      if (new Date(at).getUTCMonth() === ((m % 12) + 12) % 12) out.push(format(at)) // not-policy: months of a year
    }
    return out
  }
  const days = new Set(input.frequency === 'daily' ? [1, 2, 3, 4, 5, 6, 7] : (input.weekdays?.length ? input.weekdays : [weekdayOf(input.first)]))
  const monday = start - (weekdayOf(input.first) - 1) * DAY
  const every = input.frequency === 'fortnightly' ? 2 : 1
  for (let at = start; at <= end && out.length < limit; at += DAY) {
    const week = Math.floor((at - monday) / (7 * DAY)) // not-policy: days of a week
    const date = format(at)
    if (week % every === 0 && days.has(weekdayOf(date))) out.push(date)
  }
  return out
}
