import { londonClock } from './london'

// The conditions the show-night screens are designed for: one hand, a 360 pixel phone, a dark
// foyer (K-102). The numbers are the story's, so the primitives and their tests read one source.
export const NIGHT_VIEWPORT_PX = 360
export const NIGHT_TAP_TARGET_PX = 48

/** What NightStale shows: the London minute the screen's data last came from. */
export function lastSyncedLabel(at: Date | number | string | null | undefined): string {
  if (at === null || at === undefined) return 'Not yet synced'
  // Anything that is not an instant throws in londonClock rather than reading as never synced.
  return `Last synced ${londonClock(at instanceof Date ? at : new Date(at))}`
}
