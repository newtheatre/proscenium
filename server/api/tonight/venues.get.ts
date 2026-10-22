import { NIGHT_VENUE_COOKIE, heldNightVenueFromCookie } from '#shared/utils/night-venue'
import type { NightVenueOption } from '#shared/utils/night-venue'

// The venues running tonight, for the hub's choice of where this phone is working (0230). The
// programme is public, so anyone signed in may read it; what each venue opens is the guard's.
export default defineEventHandler(async (event) => {
  const resolved = await authority(event)
  const night = currentShowNight()
  const { from, to } = showNightBounds(night)

  const [running, mine] = await Promise.all([
    performancesOnNight(night),
    tonightShiftVenues(resolved.account.id, Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000)),
  ])

  const venues = new Map<string, NightVenueOption>()
  for (const performance of running.filter(one => one.status !== 'CANCELLED')) {
    const venue = venues.get(performance.venueId) ?? {
      venueId: performance.venueId,
      venueName: performance.venueName,
      performances: [],
      onShift: mine.includes(performance.venueId),
    }
    venue.performances.push({ id: performance.id, showTitle: performance.showTitle, startsAt: performance.startsAt })
    venues.set(performance.venueId, venue)
  }

  return {
    night,
    // Any of the three officer permissions opens every venue's screens, so all of them are a choice.
    officer: NIGHT_ROLES.some(role => resolved.permissions.has(NIGHT_ROLE_PERMISSION[role])),
    chosenVenueId: heldNightVenueFromCookie(getCookie(event, NIGHT_VENUE_COOKIE), night),
    venues: [...venues.values()],
  }
})
