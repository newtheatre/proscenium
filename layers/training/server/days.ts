// Days in the theatre's time zone. An expiry is always the end of a local day, so "valid until
// 14 March" includes the 14th (A3).
import { theatreTimeZone } from '#kit'
import { instantOfLocal, localDateOf } from '#kit/clock'

/** The date after a YYYY-MM-DD date, or `days` after it. */
export function addDays(date: string, days = 1): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10) // not-policy: the date part of an ISO string
}

/** The theatre's date of an instant. */
export async function theatreDay(at: number): Promise<string> {
  return localDateOf(at, await theatreTimeZone())
}

/** The last millisecond of a local day. */
export async function endOfLocalDay(date: string): Promise<number> {
  return instantOfLocal(addDays(date), '00:00', await theatreTimeZone()) - 1
}

/** A local date in words for a message, such as "14 March 2027". */
export function dayInWords(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d))
}
