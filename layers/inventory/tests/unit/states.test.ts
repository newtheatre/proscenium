// Inventory's state moves and window rules as pure functions (part 8, unit tests: state moves,
// windows, open-ended out lines and tags).
import { describe, expect, it } from 'vitest'
import {
  busyUntil, canMove, DISPOSAL_MOVES, DISPOSAL_STATES, FAULT_MOVES, FAULT_STATES, ITEM_MOVES, ITEM_STATES, LINE_MOVES, LINE_STATES, LOAN_MOVES, LOAN_STATES, movesInto, overlaps, tagOf,
} from '../../shared/states'

const allowed: Record<string, [Record<string, readonly string[]>, readonly string[], [string, string][]]> = {
  item: [ITEM_MOVES, ITEM_STATES, [['active', 'out-of-service'], ['active', 'missing'], ['active', 'disposed'], ['out-of-service', 'active'], ['out-of-service', 'missing'], ['out-of-service', 'disposed'], ['missing', 'active'], ['missing', 'disposed']]],
  loan: [LOAN_MOVES, LOAN_STATES, [['draft', 'requested'], ['draft', 'approved'], ['draft', 'cancelled'], ['requested', 'approved'], ['requested', 'declined'], ['requested', 'cancelled'], ['approved', 'out'], ['approved', 'cancelled'], ['out', 'returned']]],
  line: [LINE_MOVES, LINE_STATES, [['wanted', 'listed'], ['wanted', 'promised'], ['wanted', 'cancelled'], ['listed', 'promised'], ['listed', 'cancelled'], ['promised', 'out'], ['promised', 'cancelled'], ['out', 'returned'], ['out', 'lost']]],
  fault: [FAULT_MOVES, FAULT_STATES, [['open', 'repaired'], ['open', 'written-off']]],
  disposal: [DISPOSAL_MOVES, DISPOSAL_STATES, [['proposed', 'approved'], ['proposed', 'declined'], ['proposed', 'done'], ['approved', 'done']]],
}

describe('state moves (part 3)', () => {
  for (const [name, [moves, states, pairs]] of Object.entries(allowed)) {
    it(`allows exactly the ${name} moves in part 3 and refuses every other pair`, () => {
      for (const from of states) {
        for (const to of states) {
          const expected = pairs.some(([a, b]) => a === from && b === to)
          expect(canMove(moves as never, from as never, to as never), `${name} ${from} to ${to}`).toBe(expected)
        }
      }
    })
  }

  it('names the states a loan may be cancelled from: never out, never final (L1, L16)', () => {
    expect(movesInto(LOAN_MOVES, 'cancelled')).toEqual(['draft', 'requested', 'approved'])
  })
})

describe('windows (C1, C3)', () => {
  it('treats touching windows as apart and nested ones as overlapping', () => {
    expect(overlaps({ from: 0, to: 10 }, { from: 10, to: 20 })).toBe(false)
    expect(overlaps({ from: 0, to: 20 }, { from: 5, to: 6 })).toBe(true)
    expect(overlaps({ from: 5, to: 15 }, { from: 0, to: 10 })).toBe(true)
  })

  it('counts an out line past its due time as busy to the right end, and nothing else', () => {
    expect(busyUntil({ state: 'out', to: 100 }, 50)).toBe(100)
    expect(busyUntil({ state: 'out', to: 100 }, 100)).toBe(Number.POSITIVE_INFINITY)
    expect(busyUntil({ state: 'promised', to: 100 }, 500)).toBe(100)
  })
})

describe('tags (I2)', () => {
  it('pads the number to four digits and lets it grow past 9999', () => {
    expect(tagOf('LX', 42)).toBe('LX-0042')
    expect(tagOf('CST', 12345)).toBe('CST-12345')
  })
})
