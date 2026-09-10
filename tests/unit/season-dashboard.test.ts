import { describe, expect, test } from 'bun:test'
import { periodForm } from '#shared/utils/season-dashboard'

describe('a season dashboard period', () => {
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

  test('a season takes the year it ends in', () => {
    expect(periodForm.safeParse({ kind: 'SEASON', year: 2026 }).success).toBe(true)
  })

  test('term is not a selectable kind yet: it waits on the periods table (I-107)', () => {
    expect(periodForm.safeParse({ kind: 'TERM', id: 'autumn-2026' }).success).toBe(false)
  })
})
