// The moves table (part 3) and the overlap rule (C1), as pure functions.
import { describe, expect, it } from 'vitest'
import { BOOKING_STATES, canMove, movesInto, overlaps } from '../../shared/states'

describe('moves between states', () => {
  const allowed = new Set(['requested>confirmed', 'requested>declined', 'requested>withdrawn', 'requested>expired', 'confirmed>cancelled', 'confirmed>bumped', 'confirmed>completed'])
  it('allows exactly the moves in the table, and a final state is never left', () => {
    for (const from of BOOKING_STATES) {
      for (const to of BOOKING_STATES) expect(canMove(from, to), `${from} to ${to}`).toBe(allowed.has(`${from}>${to}`))
    }
  })
  it('names the states a move may come from', () => {
    expect(movesInto('confirmed')).toEqual(['requested'])
    expect(movesInto('cancelled')).toEqual(['confirmed'])
    expect(movesInto('requested')).toEqual([])
  })
})

describe('overlap', () => {
  const w = (startsAt: number, endsAt: number) => ({ startsAt, endsAt })
  it('touching ends do not overlap; one inside another and equal windows do', () => {
    expect(overlaps(w(14, 15), w(15, 16))).toBe(false)
    expect(overlaps(w(14, 18), w(15, 16))).toBe(true)
    expect(overlaps(w(14, 15), w(14, 15))).toBe(true)
    expect(overlaps(w(14, 16), w(15, 17))).toBe(true)
  })
})
