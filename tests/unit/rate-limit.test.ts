import { describe, expect, test } from 'bun:test'
import { bucketKey, verdict, windowFor } from '#shared/utils/rate-limit'

const at = (iso: string): Date => new Date(iso)

describe('fixed windows', () => {
  test('a window starts on its own boundary', () => {
    const window = windowFor(at('2026-08-27T10:07:32.000Z'), 900)
    expect(new Date(window.start * 1000).toISOString()).toBe('2026-08-27T10:00:00.000Z')
    expect(new Date(window.resetsAt * 1000).toISOString()).toBe('2026-08-27T10:15:00.000Z')
  })

  test('two instants in the same window share it', () => {
    const first = windowFor(at('2026-08-27T10:00:00.000Z'), 900)
    const last = windowFor(at('2026-08-27T10:14:59.000Z'), 900)
    expect(first.start).toBe(last.start)
  })

  test('the next second is the next window', () => {
    const before = windowFor(at('2026-08-27T10:14:59.000Z'), 900)
    const after = windowFor(at('2026-08-27T10:15:00.000Z'), 900)
    expect(after.start).toBe(before.resetsAt)
  })
})

describe('verdicts', () => {
  const window = windowFor(at('2026-08-27T10:00:00.000Z'), 900)

  test('a count at the limit is still allowed', () => {
    expect(verdict(10, 10, window, at('2026-08-27T10:00:00.000Z')).allowed).toBe(true)
  })

  test('one past it is not, and says how long to wait', () => {
    const refused = verdict(11, 10, window, at('2026-08-27T10:05:00.000Z'))
    expect(refused.allowed).toBe(false)
    expect(refused.remaining).toBe(0)
    expect(refused.retryAfterSeconds).toBe(600)
  })

  test('the wait is never zero when refused, even at the very end of a window', () => {
    expect(verdict(11, 10, window, at('2026-08-27T10:14:59.999Z')).retryAfterSeconds).toBeGreaterThan(0)
  })
})

describe('bucket keys (enumeration safety)', () => {
  // Keyed by what was submitted, so being rate limited never proves an account exists.
  test('the same address normalises to the same bucket', () => {
    expect(bucketKey('sign-in', '  Member@Example.Invalid ')).toBe(bucketKey('sign-in', 'member@example.invalid'))
  })

  test('scopes do not collide', () => {
    expect(bucketKey('sign-in', 'a@b.invalid')).not.toBe(bucketKey('verify-resend', 'a@b.invalid'))
  })
})
