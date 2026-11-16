// The committee year end (ID-24; ruling R-09). One setting, core.organisation.year-end, owned by the
// core domain and stored as MM-DD, says the day the theatre's own year ends. A role with the
// year-end rule gives each new grant the next year end as its end: the first moment of the day
// after it, in the theatre's time zone. While the setting is unset there is no year end to give.
import { nowMs, theatreTimeZone, useSetting } from '#kit'
import { instantOfLocal, localDateOf, previousDate } from '#kit/clock'

/** Pure: the end of the first year end strictly after `today` (YYYY-MM-DD), as an instant. */
export function yearEndAfter(today: string, yearEnd: string, timeZone: string): number {
  const year = Number(today.slice(0, 4)) // not-policy: the year of a YYYY-MM-DD date
  const thisYear = `${year}-${yearEnd}`
  const day = thisYear > today ? thisYear : `${year + 1}-${yearEnd}`
  return instantOfLocal(previousDate(day, -1), '00:00', timeZone)
}

/** The end a year-end grant made now gets, or null while the theatre has not set its year end. */
export async function nextYearEnd(): Promise<number | null> {
  const yearEnd = await useSetting('core.organisation.year-end') as string | null
  if (!yearEnd) return null
  const timeZone = await theatreTimeZone()
  return yearEndAfter(localDateOf(nowMs(), timeZone), yearEnd, timeZone)
}

export async function yearEndIsSet(): Promise<boolean> {
  return !!(await useSetting('core.organisation.year-end'))
}
