import { describe, expect, test } from 'bun:test'
import { autoCloseDeadline } from '#server/utils/night-auto-close'
import { showNightBounds } from '#shared/utils/show-night'

// The 24-hour cut is a show-night boundary, not a wall-clock day (0014): pure, no database.

describe('autoCloseDeadline (criterion 1)', () => {
  test('the deadline is 24 hours after the night\'s own end, not the performance\'s start', () => {
    const night = '2026-09-01'
    const startsAt = Math.floor(showNightBounds(night).from.getTime() / 1000) + 15 * 3600
    const { night: resolved, deadline } = autoCloseDeadline(startsAt)

    expect(resolved).toBe(night)
    expect(deadline).toBe(showNightBounds(night).to.getTime() + 24 * 60 * 60 * 1000)
  })

  test('a performance just after 04:00 belongs to the night that began the day before', () => {
    const night = '2026-09-01'
    // 01:00 London the morning after: still this night's own bar-close hour (0014).
    const startsAt = Math.floor(showNightBounds(night).to.getTime() / 1000) - 3 * 3600
    const { night: resolved } = autoCloseDeadline(startsAt)

    expect(resolved).toBe(night)
  })

  test('the deadline crosses a DST transition correctly, both directions', () => {
    // Clocks go forward 29 March 2026: that night is 23 hours long, not 24.
    const spring = autoCloseDeadline(Math.floor(showNightBounds('2026-03-28').from.getTime() / 1000) + 15 * 3600)
    // Clocks go back 25 October 2026: that night is 25 hours long, not 24.
    const autumn = autoCloseDeadline(Math.floor(showNightBounds('2026-10-24').from.getTime() / 1000) + 15 * 3600)

    expect(spring.deadline).toBe(showNightBounds('2026-03-28').to.getTime() + 24 * 60 * 60 * 1000)
    expect(autumn.deadline).toBe(showNightBounds('2026-10-24').to.getTime() + 24 * 60 * 60 * 1000)
    // The two nights' own lengths still differ by two hours either side of a 24-hour add.
    const springNightLength = showNightBounds('2026-03-28').to.getTime() - showNightBounds('2026-03-28').from.getTime()
    const autumnNightLength = showNightBounds('2026-10-24').to.getTime() - showNightBounds('2026-10-24').from.getTime()
    expect(autumnNightLength - springNightLength).toBe(2 * 60 * 60 * 1000)
  })
})
