// Local dates in the theatre's time zone (R7).
import { nowMs, localDateOf } from './clock'
import { useSetting } from './settings-store'

/** Today's date where the theatre is, YYYY-MM-DD. */
export async function today(): Promise<string> {
  return localDateOf(nowMs(), await useSetting('core.locale.time-zone') as string)
}

/** The theatre's local date of an instant, YYYY-MM-DD. */
export async function localDate(at: number | Date = nowMs()): Promise<string> {
  return localDateOf(typeof at === 'number' ? at : at.getTime(), await useSetting('core.locale.time-zone') as string)
}
