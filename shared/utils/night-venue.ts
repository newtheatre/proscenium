import { showNightBounds } from './show-night'

// The venue this phone is working tonight, chosen on the hub and read by every show-night guard
// that is not told one, so each screen narrows to the same house (0230).
export const NIGHT_VENUE_COOKIE = 'nnt-night-venue'

export interface HeldNightVenue { night: string, venueId: string }

// Tonight's chosen venue: another night's, or anything unreadable, is nothing chosen (0014).
export function heldNightVenue(held: unknown, night: string): string | null {
  const one = held as { night?: unknown, venueId?: unknown } | null | undefined
  return one?.night === night && typeof one.venueId === 'string' && one.venueId.length > 0 ? one.venueId : null
}

// A cookie value as the server reads it: h3 hands back the raw string, which may not be JSON.
export function heldNightVenueFromCookie(raw: string | undefined, night: string): string | null {
  if (!raw) return null
  try {
    return heldNightVenue(JSON.parse(raw), night)
  }
  catch {
    return null
  }
}

// Kept until the night it names ends at 04:00 London, and not a moment longer (0014).
export function nightVenueExpires(night: string): Date {
  return showNightBounds(night).to
}

export interface NightVenueOption {
  venueId: string
  venueName: string
  performances: { id: string, showTitle: string, startsAt: number }[]
  // Whether the viewer holds a confirmed shift there tonight.
  onShift: boolean
}

// The venues this viewer could work tonight: every running one for an officer, otherwise the
// ones their own shifts are at. More than one is the only case that needs a choice.
export function nightVenueChoices(venues: NightVenueOption[], officer: boolean): NightVenueOption[] {
  return officer ? venues : venues.filter(venue => venue.onShift)
}

// What the hub does about the venue: nothing to choose, a choice still to make, or one made.
export type NightVenueStep = 'NONE' | 'CHOOSE' | 'CHOSEN'

export function nightVenueStep(choices: NightVenueOption[], chosen: string | null): NightVenueStep {
  if (choices.length < 2) return 'NONE'
  return chosen && choices.some(venue => venue.venueId === chosen) ? 'CHOSEN' : 'CHOOSE'
}
