import { describe, expect, test } from 'bun:test'
import { isSustainedlyUnhealthy } from '#shared/utils/health'

// J-106 criterion 5: an unhealthy check alerts only once it has lasted the configured window,
// not on its first failure. The scheduled task and the notification are not yet built.

describe('an unhealthy deploy alerts once it has lasted, not on its first check', () => {
  test('healthy the whole time is never sustained', () => {
    expect(isSustainedlyUnhealthy(null, 30, 1_000_000)).toBe(false)
  })

  test('unhealthy for less than the window is not yet sustained', () => {
    const since = 1_000_000
    const now = since + 29 * 60
    expect(isSustainedlyUnhealthy(since, 30, now)).toBe(false)
  })

  test('unhealthy for exactly the window counts as sustained', () => {
    const since = 1_000_000
    const now = since + 30 * 60
    expect(isSustainedlyUnhealthy(since, 30, now)).toBe(true)
  })

  test('unhealthy for longer than the window is sustained', () => {
    const since = 1_000_000
    const now = since + 3600
    expect(isSustainedlyUnhealthy(since, 30, now)).toBe(true)
  })

  // No proposed value exists yet (0019, J-104): the alert cannot fire on a policy nobody has
  // set, so an unconfigured window never reads as sustained rather than guessing one.
  test('with no window configured, nothing is ever sustained', () => {
    expect(isSustainedlyUnhealthy(1_000_000, null, 2_000_000)).toBe(false)
  })
})
