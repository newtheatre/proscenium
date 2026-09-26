import { fromLondonWallClock, londonWeekday } from './london'
import { showNightOf } from './show-night'

// My rota's week chips and night grouping (issue 1335). Weeks run Monday to Sunday on London
// dates, and a night is the 04:00 to 04:00 show night, so a matinee and the evening share one (0014).

export const ROTA_WEEKS = ['ALL', 'THIS_WEEK', 'NEXT_WEEK', 'LATER'] as const
export type RotaWeek = (typeof ROTA_WEEKS)[number]

export function saysRotaWeek(week: RotaWeek): string {
  switch (week) {
    case 'ALL': return 'Coming up'
    case 'THIS_WEEK': return 'This week'
    case 'NEXT_WEEK': return 'Next week'
    case 'LATER': return 'Later'
    default: return week satisfies never
  }
}

function plusDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, date! + days)).toISOString().slice(0, 10)
}

// London dates the open-shift list takes as `from` and `to`, inclusive; absent is unbounded.
export function rotaWeekSpan(week: RotaWeek, today: string): { from?: string, to?: string } {
  const [year, month, date] = today.split('-').map(Number)
  const weekday = londonWeekday(fromLondonWallClock(year!, month!, date!, 12))
  const sunday = plusDays(today, (7 - weekday) % 7)
  switch (week) {
    case 'ALL': return {}
    case 'THIS_WEEK': return { from: today, to: sunday }
    case 'NEXT_WEEK': return { from: plusDays(sunday, 1), to: plusDays(sunday, 7) }
    case 'LATER': return { from: plusDays(sunday, 8) }
    default: return week satisfies never
  }
}

// In the order given, which is soonest first from the list itself.
export function byNight<T extends { startsAt: number }>(items: readonly T[]): { night: string, items: T[] }[] {
  const nights = new Map<string, T[]>()
  for (const item of items) {
    const night = showNightOf(new Date(item.startsAt * 1000))
    nights.set(night, [...(nights.get(night) ?? []), item])
  }
  return [...nights.entries()].map(([night, grouped]) => ({ night, items: grouped }))
}
