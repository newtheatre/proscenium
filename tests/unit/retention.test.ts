import { describe, expect, test } from 'bun:test'
import {
  daysUntilRetentionThreshold,
  isRetentionGuest,
  isRetentionWarnable,
  retentionDigestClaimFor,
  retentionWarningClaimFor,
} from '#shared/utils/retention'

// A-126 (built as K-111): inactivity periods are configuration, a person approaching one is warned
// twice, and a sign-in clears the trail. The pure half; the sweep is tests/e2e/retention-sweep.

describe('claim keys (criteria 1, 3)', () => {
  test('a warning claim carries the kind, the account and the sign-in it was computed against', () => {
    expect(retentionWarningClaimFor('window', 'u1', 1_700_000_000))
      .toBe('retention.warning.window:u1:1700000000')
    expect(retentionWarningClaimFor('final', 'u1', 1_700_000_000))
      .toBe('retention.warning.final:u1:1700000000')
  })

  // The trap this exists to avoid: a claim keyed on the account alone would find itself already
  // spent from years ago and never warn again.
  test('a fresh sign-in changes the claim, so the same account can be warned in a later spell', () => {
    const before = retentionWarningClaimFor('window', 'u1', 1_700_000_000)
    const after = retentionWarningClaimFor('window', 'u1', 1_750_000_000)
    expect(before).not.toBe(after)
  })

  test('window and final are independent claims for the same account and sign-in', () => {
    expect(retentionWarningClaimFor('window', 'u1', 1_700_000_000))
      .not.toBe(retentionWarningClaimFor('final', 'u1', 1_700_000_000))
  })

  test('a digest claim is per admin and per period, so one admin cannot spend another\'s', () => {
    expect(retentionDigestClaimFor('admin-1', '2026-09-08')).not.toBe(retentionDigestClaimFor('admin-2', '2026-09-08'))
    expect(retentionDigestClaimFor('admin-1', '2026-09-08')).not.toBe(retentionDigestClaimFor('admin-1', '2026-10-08'))
  })
})

describe('a guest account, for retention purposes (criterion 1)', () => {
  test('no password and no Google identity is a guest', () => {
    expect(isRetentionGuest({ password: null, googleSub: null })).toBe(true)
  })

  test('either a password or a Google identity makes it a full account', () => {
    expect(isRetentionGuest({ password: 'hash', googleSub: null })).toBe(false)
    expect(isRetentionGuest({ password: null, googleSub: 'sub' })).toBe(false)
    expect(isRetentionGuest({ password: 'hash', googleSub: 'sub' })).toBe(false)
  })
})

// The 29 August 2026 amendment. A guest or an unproven address is anonymised on its own clock
// without ever being written to, so the sweep must not claim a warning it cannot send either.
describe('who may be warned at all (A-126 criterion 1, amended)', () => {
  test('a verified full account is the only thing warned', () => {
    expect(isRetentionWarnable({ verified: true, password: 'hash', googleSub: null })).toBe(true)
    expect(isRetentionWarnable({ verified: true, password: null, googleSub: 'sub' })).toBe(true)
  })

  test('an unverified address is never warned, however complete its sign-in', () => {
    expect(isRetentionWarnable({ verified: false, password: 'hash', googleSub: 'sub' })).toBe(false)
  })

  test('an unclaimed guest is never warned, even with a verified address', () => {
    expect(isRetentionWarnable({ verified: true, password: null, googleSub: null })).toBe(false)
    expect(isRetentionWarnable({ verified: false, password: null, googleSub: null })).toBe(false)
  })
})

describe('days until the threshold (criteria 1, 2)', () => {
  const YEAR = 365.25 * 86_400

  test('exactly at the threshold reads as due, not one second early or late', () => {
    const now = 1_700_000_000
    expect(daysUntilRetentionThreshold(now - Math.round(2 * YEAR), 2, now)).toBe(0)
  })

  test('inside the threshold is positive; past it is negative', () => {
    const now = 1_700_000_000
    expect(daysUntilRetentionThreshold(now - Math.round(1 * YEAR), 2, now)).toBeGreaterThan(0)
    expect(daysUntilRetentionThreshold(now - Math.round(3 * YEAR), 2, now)).toBeLessThan(0)
  })

  test('a guest\'s three years is looser than a full account\'s two, from the same last sign-in', () => {
    const now = 1_700_000_000
    const lastActive = now - Math.round(2.5 * YEAR)
    expect(daysUntilRetentionThreshold(lastActive, 2, now)).toBeLessThan(0)
    expect(daysUntilRetentionThreshold(lastActive, 3, now)).toBeGreaterThan(0)
  })
})
