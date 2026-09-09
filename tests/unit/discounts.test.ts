import { describe, expect, test } from 'bun:test'
import { discountForm, discountStatusForm, discountedPence } from '#shared/utils/discounts'

// F-117's pure vocabulary and arithmetic. The write path and its cap check are proved against
// the real migrations and the config system in the integration and e2e suites.

describe('a discount is a name and a percentage above zero (criterion 1)', () => {
  test('a valid discount parses', () => {
    expect(discountForm.safeParse({ name: 'Members night', percent: 20 }).success).toBe(true)
  })

  test('zero, negative and over a hundred per cent are all refused', () => {
    expect(discountForm.safeParse({ name: 'X', percent: 0 }).success).toBe(false)
    expect(discountForm.safeParse({ name: 'X', percent: -5 }).success).toBe(false)
    expect(discountForm.safeParse({ name: 'X', percent: 101 }).success).toBe(false)
    expect(discountForm.safeParse({ name: 'X', percent: 100 }).success).toBe(true)
  })

  test('a fractional percentage is refused: whole points only', () => {
    expect(discountForm.safeParse({ name: 'X', percent: 12.5 }).success).toBe(false)
  })

  test('an empty name is refused', () => {
    expect(discountForm.safeParse({ name: '', percent: 10 }).success).toBe(false)
  })
})

describe('a discount is retired, never deleted', () => {
  test('the status form accepts only the two states', () => {
    expect(discountStatusForm.safeParse({ status: 'ACTIVE' }).success).toBe(true)
    expect(discountStatusForm.safeParse({ status: 'RETIRED' }).success).toBe(true)
    expect(discountStatusForm.safeParse({ status: 'DELETED' }).success).toBe(false)
  })
})

describe('the computed pence is rounded down, never in the customer\'s favour by accident', () => {
  test('a clean percentage divides exactly', () => {
    expect(discountedPence(1000, 20)).toBe(200)
  })

  test('a percentage that does not divide evenly rounds down', () => {
    expect(discountedPence(999, 20)).toBe(199)
    expect(discountedPence(101, 50)).toBe(50)
  })

  test('a hundred per cent takes the whole line, and one per cent takes almost nothing', () => {
    expect(discountedPence(500, 100)).toBe(500)
    expect(discountedPence(50, 1)).toBe(0)
  })
})
