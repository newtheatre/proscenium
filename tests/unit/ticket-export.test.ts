import { describe, expect, test } from 'bun:test'
import { resolveSeasonBounds } from '#shared/utils/ticket-export'
import { londonParts } from '#shared/utils/london'

// D-129 criterion 5: the season boundary a report resolves to, proved against the calendar
// rather than against a raw epoch nobody can eyeball.

describe('resolveSeasonBounds runs 1 August to 31 July, London (D-129 criterion 5)', () => {
  test('the default boundary opens on 1 August of the year before', () => {
    const { fromAt } = resolveSeasonBounds(2027, '08-01', '07-31')
    const opens = londonParts(new Date(fromAt * 1000))
    expect(opens).toMatchObject({ year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0 })
  })

  test('the boundary closes at the last instant of 31 July of the named year, exclusive', () => {
    const { toAt } = resolveSeasonBounds(2027, '08-01', '07-31')
    const lastIncluded = londonParts(new Date((toAt - 1) * 1000))
    expect(lastIncluded).toMatchObject({ year: 2027, month: 7, day: 31, hour: 23, minute: 59, second: 59 })

    const firstExcluded = londonParts(new Date(toAt * 1000))
    expect(firstExcluded).toMatchObject({ year: 2027, month: 8, day: 1, hour: 0, minute: 0, second: 0 })
  })

  test('the boundary carries the DST shift the calendar has in August and none in the following July', () => {
    // 1 August is always BST (UTC+1); 31 July is always BST too, so both ends sit an hour off UTC.
    const { fromAt, toAt } = resolveSeasonBounds(2027, '08-01', '07-31')
    expect(new Date(fromAt * 1000).toISOString()).toBe('2026-07-31T23:00:00.000Z')
    expect(new Date(toAt * 1000).toISOString()).toBe('2027-07-31T23:00:00.000Z')
  })

  test('a configured boundary other than the default resolves the same way', () => {
    const { fromAt, toAt } = resolveSeasonBounds(2027, '09-01', '08-31')
    expect(londonParts(new Date(fromAt * 1000))).toMatchObject({ year: 2026, month: 9, day: 1 })
    expect(londonParts(new Date((toAt - 1) * 1000))).toMatchObject({ year: 2027, month: 8, day: 31 })
  })

  test('successive seasons do not overlap and leave no gap', () => {
    const first = resolveSeasonBounds(2027, '08-01', '07-31')
    const second = resolveSeasonBounds(2028, '08-01', '07-31')
    expect(second.fromAt).toBe(first.toAt)
  })
})
