/**
 * A validity date means the whole of that day in Europe/London, so validTo
 * becomes its last instant. The Worker runs in UTC, hence the conversion.
 */

/** `YYYY-MM-DD`: the shape `<input type="date">` submits. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Offset of Europe/London from UTC, in minutes, at a given instant.
 * Positive during BST (+60), zero in winter.
 */
function londonOffsetMinutes(utc: Date): number {
  // `en-GB` with an explicit timeZone gives the local wall-clock reading, which
  // differenced against UTC is the offset. Avoids hard-coding BST rules.
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

/**
 * Start of a validity window: 00:00:00.000 Europe/London on that date.
 * A full ISO datetime is passed through untouched, so an explicit instant wins.
 */
export function validityStart(value: string): Date {
  if (!DATE_ONLY.test(value)) return new Date(value)
  return londonInstant(value, 0, 0, 0, 0)
}

/**
 * 23:59:59.999 Europe/London: inclusive of the whole final day, which is what
 * someone entering a date means.
 */
export function validityEnd(value: string): Date {
  if (!DATE_ONLY.test(value)) return new Date(value)
  return londonInstant(value, 23, 59, 59, 999)
}
