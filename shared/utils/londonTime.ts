/**
 * Resolving a Europe/London wall clock to an instant. In shared/ because the
 * training fixture dates itself with the same rule the server's windows use.
 */

/**
 * Offset of Europe/London from UTC, in minutes, at a given instant.
 * Positive during BST (+60), zero in winter.
 */
function londonOffsetMinutes(utc: Date): number {
  // The local wall-clock reading differenced against UTC is the offset, which
  // avoids hard-coding BST rules.
  const local = new Date(utc.toLocaleString('en-US', { timeZone: 'Europe/London' }))
  const asUtc = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - asUtc.getTime()) / 60_000)
}

/** Resolve a `YYYY-MM-DD` plus a wall-clock time in Europe/London to an instant. */
export function londonInstant(dateOnly: string, hours: number, minutes: number, seconds: number, ms: number): Date {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number]
  const naiveUtc = Date.UTC(y, m - 1, d, hours, minutes, seconds, ms)
  // The only misreadable inputs are the two ambiguous hours at a DST boundary,
  // which are 01:00-02:00 and so not reachable from a day boundary.
  const offset = londonOffsetMinutes(new Date(naiveUtc))
  return new Date(naiveUtc - offset * 60_000)
}

/** The `YYYY-MM-DD` a whole number of days after another, by the calendar. */
export function daysAfter(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number]
  // UTC arithmetic on a date-only value: the London correction belongs to
  // londonInstant, and doing it here as well would double-count a DST change.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
