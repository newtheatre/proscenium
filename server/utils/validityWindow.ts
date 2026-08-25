/**
 * A validity date means the whole of that day in Europe/London, so validTo
 * becomes its last instant. The Worker runs in UTC, hence the conversion.
 */

import { londonInstant } from '~~/shared/utils/londonTime'

/** `YYYY-MM-DD`: the shape `<input type="date">` submits. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

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
