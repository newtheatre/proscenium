import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { openingVenuesTonight } from './bar-openings'
import { performancesOnNight } from './performances'
import { confirmedShiftsTonight } from './rota'
import { showNightBounds } from '#shared/utils/show-night'
import type { TillVenueOption } from '#shared/utils/till'

// Which venue a till session belongs to, when the night does not answer it unaided (F-125, 0077).

// A venue nobody is running and nobody is opening is still a venue a `night.till` holder may open
// a session at, so the list is bounded rather than paged: a theatre has a handful of houses.
const VENUE_CAP = 50

export async function tillVenuesFor(userId: string, night: string, everyVenue: boolean): Promise<TillVenueOption[]> {
  const { from, to } = showNightBounds(night)
  const bounds: [number, number] = [Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)]
  const [running, shifts, openings] = await Promise.all([
    performancesOnNight(night),
    confirmedShiftsTonight(userId, 'BAR', bounds[0], bounds[1], {}),
    openingVenuesTonight(userId, bounds[0], bounds[1]),
  ])

  // Only where the caller is working, unless they hold the bypass: a picker offering what the
  // guard then refuses is a tap that lands on a 403, and a draft title is not theirs to read.
  const worked = new Set(shifts.map(shift => shift.performanceId))

  const found = new Map<string, TillVenueOption>()
  for (const performance of running) {
    if (performance.status === 'CANCELLED' || found.has(performance.venueId)) continue
    if (!everyVenue && !worked.has(performance.id)) continue
    found.set(performance.venueId, { venueId: performance.venueId, venueName: performance.venueName, what: performance.showTitle })
  }
  for (const opening of openings) {
    if (found.has(opening.venueId)) continue
    found.set(opening.venueId, { venueId: opening.venueId, venueName: opening.venueName, what: opening.label })
  }

  if (everyVenue) {
    const all = await db.all<{ venueId: string, venueName: string }>(sql`
      SELECT id AS venueId, name AS venueName FROM venues WHERE archived = 0
      ORDER BY name COLLATE NOCASE LIMIT ${VENUE_CAP}
    `)
    for (const venue of all) {
      if (found.has(venue.venueId)) continue
      found.set(venue.venueId, { ...venue, what: 'Nothing running tonight' })
    }
  }

  return [...found.values()].sort((one, two) => one.venueName.localeCompare(two.venueName))
}
