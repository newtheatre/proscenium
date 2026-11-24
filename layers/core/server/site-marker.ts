// The site marker (C-70, CF3): the host the calendar feed was first served from, kept so a later change
// of domain changes no UID. Availability drops imported events whose UID ends in it (I4).
import { changeSetting, siteUrl, useSetting, type UnitView } from '#kit'

/** The marker, kept in the given unit on first use; without a unit, today's host. */
export async function siteMarker(unit?: UnitView): Promise<string> {
  const kept = await useSetting('core.calendar.site-marker') as string | null
  if (kept) return kept
  const host = new URL(await siteUrl('/')).host
  if (unit) await changeSetting(unit, 'core.calendar.site-marker', host)
  return host
}
