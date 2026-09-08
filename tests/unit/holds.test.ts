import { describe, expect, test } from 'bun:test'
import { holdExpiresAt, holdReminderClaim, resolveHoldReleaseMinutes } from '#shared/utils/reservations'

// D-106 and D-107 as pure rules. What the database enforces is in tests/integration/holds.test.ts.

describe('the hold release point resolves performance, then the configured default', () => {
  test('with no override, the configured default stands', () => {
    expect(resolveHoldReleaseMinutes(null, 15)).toBe(15)
  })

  test('a performance override wins over the default', () => {
    expect(resolveHoldReleaseMinutes(30, 15)).toBe(30)
  })

  test('an explicit nought is this performance saying release at curtain, not an absence', () => {
    expect(resolveHoldReleaseMinutes(0, 15)).toBe(0)
  })
})

describe('a hold expires measured back from curtain (0014)', () => {
  test('minutes before curtain, in seconds', () => {
    const startsAt = 1_800_000_000
    expect(holdExpiresAt(startsAt, 15)).toBe(startsAt - 15 * 60)
  })

  test('nought minutes releases at curtain itself', () => {
    const startsAt = 1_800_000_000
    expect(holdExpiresAt(startsAt, 0)).toBe(startsAt)
  })
})

describe('a reminder claim is keyed on the expiry it warns about (D-107 criterion 2)', () => {
  test('the same reservation and the same expiry claim identically', () => {
    expect(holdReminderClaim('r-1', 1_800_000_000)).toBe(holdReminderClaim('r-1', 1_800_000_000))
  })

  test('the same reservation with a moved expiry claims differently, re-arming the reminder', () => {
    expect(holdReminderClaim('r-1', 1_800_000_000)).not.toBe(holdReminderClaim('r-1', 1_800_000_900))
  })

  test('two different reservations never share a claim', () => {
    expect(holdReminderClaim('r-1', 1_800_000_000)).not.toBe(holdReminderClaim('r-2', 1_800_000_000))
  })
})
