// How much each level of availability.seats-left says (Matt, 23 November 2026): a 200-seat house,
// nearly full at 10%, at plenty left, over half sold, nearly full and sold out.
import { describe, expect, it } from 'vitest'
import { seatsLeftSay, thresholdOf, type SeatsLeftRule } from '../../shared/seats-left'

const rule = (level: SeatsLeftRule['level'], over: Partial<SeatsLeftRule> = {}): SeatsLeftRule => ({ level, unit: 'share', share: 10, seats: 20, ...over })
const at = (r: SeatsLeftRule) => [170, 80, 12, 0].map(left => seatsLeftSay(r, left, 200))

describe('seats left', () => {
  it('says the number only at or under the threshold for "count"', () => {
    expect(at(rule('count'))).toEqual([{ state: 'available' }, { state: 'available' }, { state: 'limited', seatsLeft: 12 }, { state: 'sold-out' }])
  })

  it('says selling fast past half, then last few, with no number, for "progress"', () => {
    expect(at(rule('progress'))).toEqual([{ state: 'available' }, { state: 'available', sellingFast: true }, { state: 'limited' }, { state: 'sold-out' }])
  })

  it('says only last few for "nearly-full"', () => {
    expect(at(rule('nearly-full'))).toEqual([{ state: 'available' }, { state: 'available' }, { state: 'limited' }, { state: 'sold-out' }])
  })

  it('says nothing until sold out for "sold-out"', () => {
    expect(at(rule('sold-out'))).toEqual([{ state: 'available' }, { state: 'available' }, { state: 'available' }, { state: 'sold-out' }])
  })

  it('takes the threshold as a share of each house, rounded up, or as seats', () => {
    expect(thresholdOf(rule('count'), 60)).toBe(6)
    expect(thresholdOf(rule('count'), 5)).toBe(1)
    expect(thresholdOf(rule('count'), 0)).toBe(0)
    expect(thresholdOf(rule('count', { unit: 'seats' }), 60)).toBe(20)
    expect(seatsLeftSay(rule('count', { unit: 'seats', seats: 0 }), 1, 200)).toEqual({ state: 'available' })
  })
})
