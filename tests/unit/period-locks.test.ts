import { describe, expect, test } from 'bun:test'
import {
  closePeriodForm,
  defineTermForm,
  closedLocksWithin,
  hasBlockingConditions,
  lockStandings,
  periodLockConstraintRefusal,
  reopenPeriodForm,
} from '#shared/utils/period-locks'
import type { PeriodLockAction } from '#shared/utils/period-locks'

describe('defining a term (I-105\'s own TERM seam)', () => {
  test('a labelled range is accepted', () => {
    expect(defineTermForm.safeParse({ label: 'Autumn term', fromDay: '2026-09-21', toDay: '2026-12-11' }).success).toBe(true)
  })

  test('a term needs a label, unlike a close', () => {
    expect(defineTermForm.safeParse({ fromDay: '2026-09-21', toDay: '2026-12-11' }).success).toBe(false)
  })

  test('a range ending before it starts is refused', () => {
    expect(defineTermForm.safeParse({ label: 'Autumn term', fromDay: '2026-12-11', toDay: '2026-09-21' }).success).toBe(false)
  })
})

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
    expect(hasBlockingConditions({ unreconciledNights: [], openVarianceNights: [], alreadyClosed: [] })).toBe(false)
  })

  test('either list alone is enough to warn', () => {
    expect(hasBlockingConditions({ unreconciledNights: ['2026-09-15'], openVarianceNights: [], alreadyClosed: [] })).toBe(true)
    expect(hasBlockingConditions({ unreconciledNights: [], openVarianceNights: ['2026-09-15'], alreadyClosed: [] })).toBe(true)
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

// Newest first, the order the history lists them and the order the ledger's trigger reads them.
function locks(...rows: [string, string, string, PeriodLockAction][]): { id: string, fromDay: string, toDay: string, action: PeriodLockAction }[] {
  return rows.map(([id, fromDay, toDay, action]) => ({ id, fromDay, toDay, action }))
}

describe('what each row of the close history still governs (0129)', () => {
  test('a close nothing later touches is in force', () => {
    expect(lockStandings(locks(['sept', '2026-09-01', '2026-09-30', 'CLOSED']))).toEqual({ sept: 'CLOSED' })
  })

  test('a close reopened since is no longer in force, and the reopen reads as one', () => {
    expect(lockStandings(locks(
      ['reopen', '2026-09-01', '2026-09-30', 'REOPENED'],
      ['sept', '2026-09-01', '2026-09-30', 'CLOSED'],
    ))).toEqual({ reopen: 'REOPENED', sept: 'SUPERSEDED' })
  })

  test('of two closes of the same range, reopening the later leaves neither in force', () => {
    expect(lockStandings(locks(
      ['reopen', '2026-09-01', '2026-09-30', 'REOPENED'],
      ['again', '2026-09-01', '2026-09-30', 'CLOSED'],
      ['first', '2026-09-01', '2026-09-30', 'CLOSED'],
    ))).toEqual({ reopen: 'REOPENED', again: 'SUPERSEDED', first: 'SUPERSEDED' })
  })

  test('a close overlapped by a later reopen governs only the days left to it', () => {
    expect(lockStandings(locks(
      ['reopen', '2026-09-15', '2026-10-15', 'REOPENED'],
      ['sept', '2026-09-01', '2026-09-30', 'CLOSED'],
    ))).toEqual({ reopen: 'REOPENED', sept: 'PARTLY_CLOSED' })
  })

  test('a single day reopened inside a close leaves it partly closed', () => {
    expect(lockStandings(locks(
      ['reopen', '2026-09-10', '2026-09-10', 'REOPENED'],
      ['sept', '2026-09-01', '2026-09-30', 'CLOSED'],
    ))).toEqual({ reopen: 'REOPENED', sept: 'PARTLY_CLOSED' })
  })

  test('a reopen that a later close covers again governs nothing', () => {
    expect(lockStandings(locks(
      ['again', '2026-09-01', '2026-09-30', 'CLOSED'],
      ['reopen', '2026-09-01', '2026-09-30', 'REOPENED'],
      ['sept', '2026-09-01', '2026-09-30', 'CLOSED'],
    ))).toEqual({ again: 'CLOSED', reopen: 'SUPERSEDED', sept: 'SUPERSEDED' })
  })
})

describe('which closes a new range would overlap (0129)', () => {
  const history = locks(
    ['reopen', '2026-08-01', '2026-08-31', 'REOPENED'],
    ['aug', '2026-08-01', '2026-08-31', 'CLOSED'],
    ['sept', '2026-09-01', '2026-09-30', 'CLOSED'],
  )

  test('the same range again overlaps the close in force', () => {
    expect(closedLocksWithin(history, '2026-09-01', '2026-09-30').map(lock => lock.id)).toEqual(['sept'])
  })

  test('a range reaching into a closed one overlaps it', () => {
    expect(closedLocksWithin(history, '2026-09-30', '2026-10-31').map(lock => lock.id)).toEqual(['sept'])
  })

  test('a range over reopened or untouched days overlaps nothing', () => {
    expect(closedLocksWithin(history, '2026-08-01', '2026-08-31')).toEqual([])
    expect(closedLocksWithin(history, '2026-10-01', '2026-10-31')).toEqual([])
  })
})
