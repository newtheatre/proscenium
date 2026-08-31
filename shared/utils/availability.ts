import { fromLondonWallClock } from './london'
import type { Span } from './bookings'

// Availability over a span of London days, so the two days a year that are not 24 hours long come
// out right without anybody having to think about them (0014, C-103).

export const MAX_AVAILABILITY_DAYS = 31

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export type Window
  = | { ok: true, fromAt: Date, toAt: Date, days: number }
    | { ok: false, why: string }

export function planWindow(from: string, to: string): Window {
  const start = DAY.exec(from)
  const end = DAY.exec(to)
  if (!start || !end) return { ok: false, why: 'A date reads as YYYY-MM-DD' }

  const fromAt = midnight(start)
  const toAt = midnight(end, 1)
  if (!fromAt || !toAt) return { ok: false, why: 'That is not a date in the calendar' }
  if (toAt <= fromAt) return { ok: false, why: 'A search ends after it starts' }

  // Counted in days rather than milliseconds: a window across a clock change is not a round
  // number of 24-hour periods.
  const days = daysBetween(start, end) + 1
  if (days > MAX_AVAILABILITY_DAYS) {
    return { ok: false, why: `A search covers at most ${MAX_AVAILABILITY_DAYS} days` }
  }

  return { ok: true, fromAt, toAt, days }
}

function midnight(parts: RegExpExecArray, plusDays = 0): Date | null {
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const at = fromLondonWallClock(year, month, day + plusDays)
  return Number.isNaN(at.getTime()) ? null : at
}

function daysBetween(from: RegExpExecArray, to: RegExpExecArray): number {
  const utc = (parts: RegExpExecArray): number =>
    Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

// What is left of a span once the taken parts are removed. Half-open throughout, so two bookings
// meeting at an instant leave no sliver between them (criterion 3).
export function freeBetween(within: Span, taken: Span[]): Span[] {
  const covering = [...taken]
    .map(span => ({
      startsAt: Math.max(span.startsAt, within.startsAt),
      endsAt: Math.min(span.endsAt, within.endsAt),
    }))
    .filter(span => span.endsAt > span.startsAt)
    .sort((one, other) => one.startsAt - other.startsAt)

  const free: Span[] = []
  let cursor = within.startsAt

  for (const span of covering) {
    if (span.startsAt > cursor) free.push({ startsAt: cursor, endsAt: span.startsAt })
    cursor = Math.max(cursor, span.endsAt)
  }
  if (cursor < within.endsAt) free.push({ startsAt: cursor, endsAt: within.endsAt })

  return free
}
