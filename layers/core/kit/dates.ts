// Local dates in the theatre's time zone (R7). The zone is unset until setup, and until then no
// theatre date is computed: a caller gets a refusal rather than a date in the wrong zone.
import { nowMs, localDateOf } from './clock'
import { Refusal } from './refusal'
import { useSetting } from './settings-store'

/**
 * What to do about a missing time zone, in the refusal every caller gives (core.locale.time-zone-unset).
 * A screen showing that refusal links to the setting for those who may change it.
 */
export const TIME_ZONE_REMEDY = 'An admin sets it in Admin, on the Theatre page.'

/** The theatre's time zone; refuses while setup has not set it. */
export async function theatreTimeZone(): Promise<string> {
  const zone = await useSetting('core.locale.time-zone') as string | null
  if (!zone) throw new Refusal('core.locale.time-zone-unset', "The theatre's time zone has not been set yet.", { status: 409, remedy: TIME_ZONE_REMEDY })
  return zone
}

/** Today's date where the theatre is, YYYY-MM-DD. */
export async function today(): Promise<string> {
  return localDateOf(nowMs(), await theatreTimeZone())
}

/** The theatre's local date of an instant, YYYY-MM-DD. */
export async function localDate(at: number | Date = nowMs()): Promise<string> {
  return localDateOf(typeof at === 'number' ? at : at.getTime(), await theatreTimeZone())
}
