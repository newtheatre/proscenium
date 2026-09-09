import { describe, expect, test } from 'bun:test'
import { commitCompSaleForm, compRequestExpired, compRequestForm, declineCompRequestForm } from '#shared/utils/comps'

// Comps by request and approval, before the sale (F-110). The database write path has its own
// tests in `tests/e2e/comps.test.ts`; this is the pure vocabulary and validation.

describe('a comp request needs a reason and a basket', () => {
  const base = { lines: [{ variantId: 'v1', qty: 1 }] }

  test('a reason and at least one line is accepted', () => {
    expect(compRequestForm.safeParse({ ...base, reason: 'Birthday round for the cast' }).success).toBe(true)
  })

  test('an empty reason is refused', () => {
    expect(compRequestForm.safeParse({ ...base, reason: '' }).success).toBe(false)
  })

  test('a whitespace-only reason is refused', () => {
    expect(compRequestForm.safeParse({ ...base, reason: '   ' }).success).toBe(false)
  })

  test('no lines is refused', () => {
    expect(compRequestForm.safeParse({ lines: [], reason: 'Something' }).success).toBe(false)
  })
})

describe('a decline needs a reason', () => {
  test('a reason is accepted', () => {
    expect(declineCompRequestForm.safeParse({ reason: 'Too close to the cap for tonight' }).success).toBe(true)
  })

  test('no reason is refused', () => {
    expect(declineCompRequestForm.safeParse({}).success).toBe(false)
  })
})

describe('spending an approved request needs the screen\'s own belief of what it gives away', () => {
  test('a nonnegative figure is accepted, with no age check by default', () => {
    const parsed = commitCompSaleForm.safeParse({ expectedForegonePence: 500 })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.ageCheck).toBe(null)
  })

  test('a negative figure is refused', () => {
    expect(commitCompSaleForm.safeParse({ expectedForegonePence: -1 }).success).toBe(false)
  })
})

describe('expiry is derived at read time, from creation, never stored (criterion 3)', () => {
  const now = new Date('2026-09-09T22:00:00Z')

  test('inside the window is not expired', () => {
    const createdAt = Math.floor(now.getTime() / 1000) - 5 * 60
    expect(compRequestExpired(createdAt, 10, now)).toBe(false)
  })

  test('past the window is expired', () => {
    const createdAt = Math.floor(now.getTime() / 1000) - 11 * 60
    expect(compRequestExpired(createdAt, 10, now)).toBe(true)
  })

  test('exactly at the boundary is not yet expired', () => {
    const createdAt = Math.floor(now.getTime() / 1000) - 10 * 60
    expect(compRequestExpired(createdAt, 10, now)).toBe(false)
  })
})
