// The door counter's arithmetic (BO-73, HC4).
import { describe, expect, it } from 'vitest'
import { fullness, tally, type Tap } from '../../shared/headcount'

const tap = (id: string, kind: Tap['kind'], quantity = 1, tappedAt = 0, reversesId: string | null = null): Tap => ({ id, kind, quantity, reversesId, tappedAt })

describe('the door counter', () => {
  it('headcount-inside-not-negative: more out than in shows nought inside', () => {
    expect(tally([tap('a', 'in', 2, 1), tap('b', 'out', 5, 2)])).toEqual({ in: 2, out: 5, inside: 0, peak: 2 })
  })

  it('an undone press counts for nothing, and the undo itself is no press', () => {
    expect(tally([tap('a', 'in', 4, 1), tap('b', 'undo', 4, 2, 'a'), tap('c', 'in', 1, 3)])).toEqual({ in: 1, out: 0, inside: 1, peak: 1 })
  })

  it('keeps the peak by the devices\' clocks, whatever order the presses arrived in', () => {
    expect(tally([tap('c', 'out', 3, 30), tap('a', 'in', 10, 10), tap('b', 'in', 2, 20)])).toEqual({ in: 12, out: 3, inside: 9, peak: 12 })
  })

  it('warns from the set share, says full at capacity, and has no capacity to warn against', () => {
    expect(fullness(89, 100, 90)).toBe('ok')
    expect(fullness(90, 100, 90)).toBe('warning')
    expect(fullness(100, 100, 90)).toBe('full')
    expect(fullness(130, 100, 90)).toBe('full')
    expect(fullness(500, null, 90)).toBe('ok')
  })
})
