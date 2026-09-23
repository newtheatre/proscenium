import { describe, expect, test } from 'bun:test'
import { fromLondonWallClock } from '#shared/utils/london'
import { showNightBounds } from '#shared/utils/show-night'
import { tonightsPerformance } from '#tests/helpers/programme'

// The shared fixture on a fixed clock: a suite filtering on `starts_at >= now` must find
// tonight's performance still to come at any hour of the night (#1200, K-121).

const discard = { batch: () => {} }

function seededAt(now: Date): { night: string, startsAt: number } {
  return tonightsPerformance(discard, { now })
}

describe('tonight\'s performance on a fixed clock', () => {
  test('at 03:45 London the night is the one that began yesterday, and its curtain is still to come', () => {
    const now = fromLondonWallClock(2026, 9, 23, 3, 45)
    const { night, startsAt } = seededAt(now)
    expect(night).toBe('2026-09-22')
    expect(startsAt * 1000).toBeGreaterThan(now.getTime())
    expect(startsAt * 1000).toBeLessThan(showNightBounds(night).to.getTime())
  })

  test('before the evening the curtain is 19:30, and later in it two hours from now', () => {
    const morning = seededAt(fromLondonWallClock(2026, 9, 22, 10, 0))
    expect(morning.startsAt * 1000).toBe(fromLondonWallClock(2026, 9, 22, 19, 30).getTime())
    const evening = seededAt(fromLondonWallClock(2026, 9, 22, 21, 0))
    expect(evening.startsAt * 1000).toBe(fromLondonWallClock(2026, 9, 22, 23, 0).getTime())
  })

  // Every five minutes across an ordinary night and the 23- and 25-hour ones the clocks change in.
  test('whenever in the night the clock reads, the curtain is after it and inside the night', () => {
    for (const night of ['2026-09-22', '2026-03-28', '2026-10-24']) {
      const { from, to } = showNightBounds(night)
      for (let at = from.getTime(); at < to.getTime(); at += 5 * 60_000) {
        const seeded = seededAt(new Date(at))
        expect(seeded.night).toBe(night)
        expect(seeded.startsAt * 1000).toBeGreaterThan(at)
        expect(seeded.startsAt * 1000).toBeLessThan(to.getTime())
      }
    }
  })

  test('in the seconds before 03:30 the curtain is still a quarter of an hour away, not moments', () => {
    const now = fromLondonWallClock(2026, 9, 23, 3, 29, 59)
    const { startsAt } = seededAt(now)
    expect(startsAt * 1000 - now.getTime()).toBeGreaterThanOrEqual(15 * 60_000)
  })

  test('in the last second of the night the curtain never spills into the next one', () => {
    const now = new Date(showNightBounds('2026-09-22').to.getTime() - 400)
    const { night, startsAt } = seededAt(now)
    expect(startsAt * 1000).toBeLessThan(showNightBounds(night).to.getTime())
  })

  test('a night named outright keeps its 03:30 cap, whatever the clock', () => {
    const now = fromLondonWallClock(2026, 9, 23, 3, 45)
    const { startsAt } = tonightsPerformance(discard, { night: '2026-09-10', now })
    expect(startsAt * 1000).toBe(fromLondonWallClock(2026, 9, 11, 3, 30).getTime())
  })
})
