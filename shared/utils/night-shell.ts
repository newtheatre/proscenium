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

// A minute: longer than any show-night screen's own refresh, so one missed poll is not announced
// while a connection that has actually gone is (K-101 criterion 3).
export const NIGHT_STALE_AFTER_MS = 60_000

export type NightFreshness = 'NEVER' | 'FRESH' | 'STALE'

/** Fresh or stale, so a screen reader hears the change and never the clock ticking under it. */
export function nightFreshness(at: Date | number | string | null | undefined, now: number): NightFreshness {
  if (at === null || at === undefined) return 'NEVER'
  const synced = at instanceof Date ? at.getTime() : new Date(at).getTime()
  return now - synced >= NIGHT_STALE_AFTER_MS ? 'STALE' : 'FRESH'
}

export function staleAnnouncement(state: NightFreshness): string {
  if (state === 'STALE') return 'These figures are no longer current.'
  if (state === 'FRESH') return 'These figures are current.'
  return 'Nothing has synced yet.'
}
