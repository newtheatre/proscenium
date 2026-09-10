import { describe, expect, test } from 'bun:test'
import {
  closePeriodForm,
  hasBlockingConditions,
  periodLockConstraintRefusal,
  reopenPeriodForm,
} from '#shared/utils/period-locks'

describe('closing a period (I-107 criterion 1)', () => {
  test('a well-formed range is accepted', () => {
    expect(closePeriodForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-12-20' }).success).toBe(true)
  })

  test('a range ending before it starts is refused', () => {
    const result = closePeriodForm.safeParse({ fromDay: '2026-12-20', toDay: '2026-09-01' })
    expect(result.success).toBe(false)
  })

  test('a single-day period is a valid range', () => {
    expect(closePeriodForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-01' }).success).toBe(true)
  })

  test('a day not shaped YYYY-MM-DD is refused', () => {
    expect(closePeriodForm.safeParse({ fromDay: '1 September 2026', toDay: '2026-09-30' }).success).toBe(false)
    expect(closePeriodForm.safeParse({ fromDay: '2026-9-1', toDay: '2026-09-30' }).success).toBe(false)
  })

  test('a label is optional and bounded', () => {
    expect(closePeriodForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-30' }).success).toBe(true)
    expect(closePeriodForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-30', label: 'Autumn term' }).success).toBe(true)
    expect(closePeriodForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-30', label: '' }).success).toBe(false)
  })
})

describe('reopening a period (I-107 criterion 4)', () => {
  test('the range typed back is the whole of the confirmation', () => {
    expect(reopenPeriodForm.safeParse({ confirmFromDay: '2026-09-01', confirmToDay: '2026-09-30' }).success).toBe(true)
    expect(reopenPeriodForm.safeParse({ confirmFromDay: '2026-09-01' }).success).toBe(false)
  })
})

describe('what closing warns about before it proceeds (criterion 5)', () => {
  test('nothing outstanding is nothing to warn about', () => {
    expect(hasBlockingConditions({ unreconciledNights: [], openVarianceNights: [] })).toBe(false)
  })

  test('either list alone is enough to warn', () => {
    expect(hasBlockingConditions({ unreconciledNights: ['2026-09-15'], openVarianceNights: [] })).toBe(true)
    expect(hasBlockingConditions({ unreconciledNights: [], openVarianceNights: ['2026-09-15'] })).toBe(true)
  })
})

describe('the constraint refusal the route reads back (0047)', () => {
  test('the range-order check translates to a 409', () => {
    const error = new Error('CHECK constraint failed: period_locks_range_order')
    expect(periodLockConstraintRefusal(error)).toEqual({ statusCode: 409, statusMessage: 'A period cannot end before it starts' })
  })

  test('an unrecognised failure is not swallowed', () => {
    expect(periodLockConstraintRefusal(new Error('something else entirely'))).toBeNull()
  })
})
