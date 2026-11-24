// Best times (F3) and a person's worst level over a stretch.
import { describe, expect, it } from 'vitest'
import { bestTimes, worstBetween } from '../../shared/find'

const day = (pieces: [number, number, string][]) => pieces.map(([start, end, level]) => ({ start, end, level: level as 'free' }))

describe('worstBetween', () => {
  it('takes busy over maybe over unknown over free', () => {
    const pieces = day([[0, 600, 'free'], [600, 660, 'unknown'], [660, 720, 'maybe'], [720, 1440, 'busy']])
    expect([worstBetween(pieces, 0, 600), worstBetween(pieces, 540, 660), worstBetween(pieces, 600, 700), worstBetween(pieces, 700, 800)]).toEqual(['free', 'unknown', 'maybe', 'busy'])
  })
})

describe('bestTimes', () => {
  const weeks = {
    a: { d: day([[0, 1440, 'free']]) },
    b: { d: day([[0, 600, 'maybe'], [600, 1440, 'free']]) },
  }
  const base = { dates: ['d'], people: ['a', 'b'], must: [], weeks, step: 60, hours: { start: 540, end: 720 }, length: 60, taken: {}, roomOptional: false, after: { date: '', minute: 0 } }

  it('ranks by most free, then fewest maybe, then earliest', () => {
    expect(bestTimes(base).map(s => s.start)).toEqual([600, 660, 540])
  })

  it('skips slots before now and slots a must-have person cannot do', () => {
    expect(bestTimes({ ...base, after: { date: 'd', minute: 620 } }).map(s => s.start)).toEqual([660])
    expect(bestTimes({ ...base, must: ['b'], length: 120 }).map(s => s.start)).toEqual([600])
  })
})
