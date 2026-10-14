import { describe, expect, test } from 'bun:test'
import { civilDateOf } from '../../app/utils/civil-date'

// The date field's segments emit a value on every keystroke, so a year typed digit by digit
// passes through 0002, 0020 and 0202 before it reaches 2026.
describe('the date field reads a calendar value as a civil date', () => {
  test('a whole date reads as YYYY-MM-DD', () => {
    expect(civilDateOf({ year: 2026, month: 10, day: 4 })).toBe('2026-10-04')
  })

  test('a year still being typed is not a date yet', () => {
    for (const year of [2, 20, 202]) expect(civilDateOf({ year, month: 10, day: 14 })).toBeNull()
  })

  test('a cleared field reads as no date', () => {
    expect(civilDateOf(null)).toBeUndefined()
    expect(civilDateOf({ year: 2026 })).toBeUndefined()
  })
})
