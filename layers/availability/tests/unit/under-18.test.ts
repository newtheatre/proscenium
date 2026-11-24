import { describe, expect, it } from 'vitest'
import { lateFor } from '../../shared/find'

describe('lateFor (F6)', () => {
  const u = { lateFinish: 1320, late: { '2027-01-12': ['a'] }, oneToOne: false }
  it('names the under-18s on a slot ending after the latest finish', () => {
    expect(lateFor(u, { date: '2027-01-12', end: 1350 })).toEqual(['a'])
  })
  it('names nobody at or before it, on another date, or when unset', () => {
    expect(lateFor(u, { date: '2027-01-12', end: 1320 })).toEqual([])
    expect(lateFor(u, { date: '2027-01-13', end: 1400 })).toEqual([])
    expect(lateFor({ ...u, lateFinish: null }, { date: '2027-01-12', end: 1400 })).toEqual([])
  })
})
