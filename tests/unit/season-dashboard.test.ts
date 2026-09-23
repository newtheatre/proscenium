import { describe, expect, test } from 'bun:test'
import { periodForm, periodQuery } from '#shared/utils/season-dashboard'

describe('a money dashboard period', () => {
  test('a day takes a date', () => {
    expect(periodForm.safeParse({ kind: 'DAY', day: '2026-09-15' }).success).toBe(true)
  })

  test('a week takes a date it starts on', () => {
    expect(periodForm.safeParse({ kind: 'WEEK', day: '2026-09-15' }).success).toBe(true)
  })

  test('a month takes a year and a month number', () => {
    expect(periodForm.safeParse({ kind: 'MONTH', year: 2026, month: 9 }).success).toBe(true)
  })

  test('a month past 12 is refused', () => {
    expect(periodForm.safeParse({ kind: 'MONTH', year: 2026, month: 13 }).success).toBe(false)
  })

  test('a year takes the year it ends in (0087)', () => {
    expect(periodForm.safeParse({ kind: 'YEAR', year: 2026 }).success).toBe(true)
  })

  test('a season is not the whole year: a season named by a year is refused (0087)', () => {
    expect(periodForm.safeParse({ kind: 'SEASON', year: 2026 }).success).toBe(false)
  })

  test('a season is named by its own row in the seasons table (0087)', () => {
    expect(periodForm.safeParse({ kind: 'SEASON', seasonId: 'season-autumn-2026' }).success).toBe(true)
  })

  test('a season with no id, or with a range instead, is refused: the server resolves its days', () => {
    expect(periodForm.safeParse({ kind: 'SEASON', seasonId: '  ' }).success).toBe(false)
    expect(periodForm.safeParse({ kind: 'SEASON', fromDay: '2026-09-21', toDay: '2026-12-11' }).success).toBe(false)
  })

  test('a term takes the range the defined term itself carries', () => {
    expect(periodForm.safeParse({ kind: 'TERM', fromDay: '2026-09-21', toDay: '2026-12-11' }).success).toBe(true)
  })

  test('a term named by id rather than by its range is refused: the screen resolves the range', () => {
    expect(periodForm.safeParse({ kind: 'TERM', id: 'autumn-2026' }).success).toBe(false)
  })
})

// The money dashboard and the reports screen send a period the same way (E-126 criterion 5), and
// what they send must parse back as the period it came from.
describe('a period as a query string', () => {
  test.each([
    [{ kind: 'DAY', day: '2026-09-15' }, { kind: 'DAY', day: '2026-09-15' }],
    [{ kind: 'WEEK', day: '2026-09-15' }, { kind: 'WEEK', day: '2026-09-15' }],
    [{ kind: 'MONTH', year: 2026, month: 9 }, { kind: 'MONTH', year: '2026', month: '9' }],
    [{ kind: 'YEAR', year: 2027 }, { kind: 'YEAR', year: '2027' }],
    [{ kind: 'TERM', fromDay: '2026-09-21', toDay: '2026-12-11' }, { kind: 'TERM', fromDay: '2026-09-21', toDay: '2026-12-11' }],
    [{ kind: 'SEASON', seasonId: 'autumn-2026' }, { kind: 'SEASON', seasonId: 'autumn-2026' }],
  ] as const)('%o is sent as %o', (period, sent) => {
    expect(periodQuery(period)).toEqual(sent)
    expect(periodForm.parse(periodQuery(period))).toEqual(period)
  })
})
