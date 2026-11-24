// Best times (F3), a person's worst level over a stretch, and commitments laid over a day (F4).
import { describe, expect, it } from 'vitest'
import { bestTimes, overlay, worstBetween } from '../../shared/find'

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

describe('overlay', () => {
  it('lays a commitment only where it is worse, splitting the pieces it crosses', () => {
    const pieces = day([[0, 600, 'free'], [600, 900, 'busy'], [900, 1440, 'unknown']])
    expect(overlay(pieces, { start: 540, end: 960 }, 'maybe', 'x.pencil')).toEqual([
      { start: 0, end: 540, level: 'free' },
      { start: 540, end: 600, level: 'maybe', commitment: 'x.pencil' },
      { start: 600, end: 900, level: 'busy' },
      { start: 900, end: 960, level: 'maybe', commitment: 'x.pencil' },
      { start: 960, end: 1440, level: 'unknown' },
    ])
  })
})
