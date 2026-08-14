/**
 * Turning the `YYYY-MM-DD` dates staff type into the instants a pass is valid
 * for.
 *
 * A validity *date* means the whole of that day in Europe/London, so `validTo`
 * becomes the last instant of it. Both bounds are resolved in London, not UTC:
 * the Worker runs in UTC, and `new Date('2026-07-31')` is UTC midnight, which
 * is before a 19:30 curtain-up on the same date. Taking that literally rejects
 * a pass for the whole of its final day, and never validates a single-day one.
 */

/** `YYYY-MM-DD` — the shape `<input type="date">` submits. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Offset of Europe/London from UTC, in minutes, at a given instant.
 * Positive during BST (+60), zero in winter.
 */
function londonOffsetMinutes(utc: Date): number {
  // `en-GB` with an explicit timeZone gives the local wall-clock reading, which
  // differenced against the UTC reading is the offset. Avoids hard-coding the
  // BST rules, which have changed before and are a political decision.
  const local = new Date(utc.toLocaleString('en-US', { timeZone: 'Europe/London' }))
  const asUtc = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - asUtc.getTime()) / 60_000)
}

/** Resolve a `YYYY-MM-DD` plus a wall-clock time in Europe/London to an instant. */
function londonInstant(dateOnly: string, hours: number, minutes: number, seconds: number, ms: number): Date {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number]
  const naiveUtc = Date.UTC(y, m - 1, d, hours, minutes, seconds, ms)
  // Offset looked up at the naive instant, then applied. The only inputs this
  // could misread are the two ambiguous hours at a DST boundary, which are
  // 01:00-02:00 — not a day boundary, so not reachable from here.
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
 * End of a validity window: 23:59:59.999 Europe/London on that date.
 *
 * Inclusive of the whole final day, which is what a person entering a date
 * means and what the comment in `canRedeem` promises — "admitting someone at
 * 19:25 to a 19:30 show on the pass's last day should work".
 */
export function validityEnd(value: string): Date {
  if (!DATE_ONLY.test(value)) return new Date(value)
  return londonInstant(value, 23, 59, 59, 999)
}
