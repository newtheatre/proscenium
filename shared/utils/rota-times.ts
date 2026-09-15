import { londonClock } from './london'

// When a shift is worked, and what that window lets its holder do (0078, E-131). Absolute
// seconds throughout, so the two clock-change nights need no case of their own.

export const SECONDS_PER_MINUTE = 60

export interface ShiftOffsets {
  startBeforeDoorsMinutes: number
  endAfterEndMinutes: number
}

// What the programme records about a performance's clock. Everything but the curtain is
// optional, because a house that has not recorded its doors or its running time still stamps.
export interface PerformanceTimes {
  startsAt: number
  doorsAt?: number | null
  durationMinutes?: number | null
  intervalCount?: number | null
  intervalMinutes?: number | null
}

export interface ShiftWindow {
  startsAt: number
  endsAt: number
}

// The curtain is the fallback at both ends: an unrecorded doors time or running time leaves the
// offsets measured from it rather than guessing a house's habits (0078).
export function performanceEnd(performance: PerformanceTimes): number {
  const intervals = (performance.intervalCount ?? 0) * (performance.intervalMinutes ?? 0)
  const running = (performance.durationMinutes ?? 0) + intervals
  return performance.startsAt + running * SECONDS_PER_MINUTE
}

export function shiftWindow(performance: PerformanceTimes, offsets: ShiftOffsets): ShiftWindow {
  const doors = performance.doorsAt ?? performance.startsAt
  return {
    startsAt: doors - offsets.startBeforeDoorsMinutes * SECONDS_PER_MINUTE,
    endsAt: performanceEnd(performance) + offsets.endAfterEndMinutes * SECONDS_PER_MINUTE,
  }
}

// The template's own offsets where it holds them, the configured defaults where it does not:
// null on a template row means the venue has never been asked the question (0078).
export function offsetsFor(
  template: { startsBeforeDoorsMinutes?: number | null, endsAfterEndMinutes?: number | null } | null,
  defaults: ShiftOffsets,
): ShiftOffsets {
  return {
    startBeforeDoorsMinutes: template?.startsBeforeDoorsMinutes ?? defaults.startBeforeDoorsMinutes,
    endAfterEndMinutes: template?.endsAfterEndMinutes ?? defaults.endAfterEndMinutes,
  }
}

// Authority holds inside the window, widened by the grace at both ends (0078, E-131 criterion 4).
// A window missing either end bounds nobody: an unknown window is not evidence of being off shift.
export function insideWindow(
  window: { startsAt?: number | null, endsAt?: number | null } | null,
  at: number,
  graceMinutes: number,
): boolean {
  if (!window || window.startsAt == null || window.endsAt == null) return true
  const grace = graceMinutes * SECONDS_PER_MINUTE
  return at >= window.startsAt - grace && at <= window.endsAt + grace
}

// The window in London wall clock, which is what a refusal quotes: a volunteer reads the times
// off the rota, never a Unix instant (E-131 criterion 4).
export function saysWindow(window: ShiftWindow): string {
  return `${londonClock(new Date(window.startsAt * 1000))} to ${londonClock(new Date(window.endsAt * 1000))}`
}

export interface WindowedPerformance extends ShiftWindow {
  performanceId: string
}

// How far outside a window an instant falls; zero when it is inside one.
function distance(window: ShiftWindow, at: number): number {
  if (at < window.startsAt) return window.startsAt - at
  if (at > window.endsAt) return at - window.endsAt
  return 0
}

// Which house a sale belongs to on a two-performance day (F-126 criteria 1 and 2): the window
// containing it, else the nearest, with a tie going to the earlier performance.

// Deliberately not `activePerformanceId` (shared/utils/tonight.ts), which asks what the screen
// should be showing now; between houses the two differ, and a sale belongs to the nearer bar.
export function pickByWindow(windows: WindowedPerformance[], at: number): string | null {
  return nearestWindow(windows, at)?.performanceId ?? null
}

// The window containing the instant, else the nearest, tie to the earlier. Where an early-opening,
// late-shutting bar makes two contain it, the later house wins: the drink is for the show going in.
export function nearestWindow<T extends ShiftWindow>(windows: T[], at: number): T | null {
  let best: T | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const window of [...windows].sort((one, two) => one.startsAt - two.startsAt)) {
    const away = distance(window, at)
    if (away < bestDistance || (away === 0 && bestDistance === 0)) {
      best = window
      bestDistance = away
    }
  }
  return best
}

// Which of the houses a caller covers a sale belongs to (F-126). A window outside their authority
// is not theirs to resolve on, and one house is one house whatever the clock says.
export function houseForSale(covered: string[], windows: WindowedPerformance[], at: number): string | null {
  if (covered.length <= 1) return covered[0] ?? null
  return pickByWindow(windows.filter(window => covered.includes(window.performanceId)), at)
}
