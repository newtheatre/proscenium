import { describe, expect, test } from 'bun:test'
import {
  HOLDING_STATUSES,
  RELEASING_STATUSES,
  RESERVATION_STATUSES,
  capacityRefusal,
  holdsSeat,
  loweringRefusal,
  seatsHeldBy,
} from '#shared/utils/capacity'
import type { ReservationStatus } from '#shared/utils/capacity'

// D-105 as pure rules. What the database refuses is in tests/integration/capacity.test.ts, and the
// contended case is the named capacity race in tests/integration/races.test.ts.

describe('a seat is held by a status and released by one (D-105 criterion 3)', () => {
  test('every reservation status either holds a seat or releases it, and none is unclassified', () => {
    const classified = [...HOLDING_STATUSES, ...RELEASING_STATUSES].sort()
    expect(classified).toEqual([...RESERVATION_STATUSES].sort())
  })

  test('pending, collected and door hold a seat', () => {
    for (const status of HOLDING_STATUSES) {
      expect(`${status}: ${holdsSeat(status, null)}`).toBe(`${status}: true`)
    }
  })

  // Criterion 3: a released seat leaves the count at once, with nothing to sweep and no second
  // record of how full the house is.
  test('expired, cancelled and no-show release it', () => {
    for (const status of RELEASING_STATUSES) {
      expect(`${status}: ${holdsSeat(status, null)}`).toBe(`${status}: false`)
    }
  })

  test('a refunded ticket releases its seat whatever the reservation says', () => {
    for (const status of RESERVATION_STATUSES) {
      expect(`${status}: ${holdsSeat(status, 1_780_000_000)}`).toBe(`${status}: false`)
    }
  })

  test('the seats a set of tickets holds counts only the ones still holding', () => {
    const tickets: { status: ReservationStatus, refundedAt: number | null }[] = [
      { status: 'PENDING', refundedAt: null },
      { status: 'COLLECTED', refundedAt: null },
      { status: 'COLLECTED', refundedAt: 1_780_000_000 },
      { status: 'EXPIRED', refundedAt: null },
      { status: 'DOOR', refundedAt: null },
    ]
    expect(seatsHeldBy(tickets)).toBe(3)
  })
})

describe('a house that cannot take the order refuses quoting both figures (D-105 criterion 1)', () => {
  test('an uncapped venue takes any order', () => {
    expect(capacityRefusal(null, 4000, 10)).toBeNull()
  })

  test('an order that exactly fills the house is allowed', () => {
    expect(capacityRefusal(100, 90, 10)).toBeNull()
  })

  test('an order one seat over is refused, and the refusal quotes what is left', () => {
    const refused = capacityRefusal(100, 91, 10)
    expect(refused?.remaining).toBe(9)
    expect(refused?.says).toBe('There are 9 tickets left for this performance, and you asked for 10')
  })

  test('a full house says so rather than quoting nought left', () => {
    expect(capacityRefusal(100, 100, 1)?.says).toBe('This performance is sold out')
  })

  test('a house sold past its capacity is still sold out rather than negative', () => {
    const refused = capacityRefusal(100, 104, 1)
    expect(refused?.remaining).toBe(0)
    expect(refused?.says).toBe('This performance is sold out')
  })

  test('the singular reads as English', () => {
    expect(capacityRefusal(100, 99, 2)?.says).toBe('There is 1 ticket left for this performance, and you asked for 2')
  })
})

// Criterion 4: deliberate oversell is done by raising capacity, never by lowering it under what is
// already held, and the refusal quotes both figures.
describe('capacity cannot be lowered under what is already held (D-105 criterion 4)', () => {
  test('lowering to what is held exactly is allowed', () => {
    expect(loweringRefusal(40, 40)).toBeNull()
  })

  test('raising is always allowed, which is how a deliberate oversell is done', () => {
    expect(loweringRefusal(200, 40)).toBeNull()
  })

  test('uncapping is always allowed', () => {
    expect(loweringRefusal(null, 40)).toBeNull()
  })

  test('lowering under what is held is refused quoting both figures', () => {
    expect(loweringRefusal(30, 40))
      .toBe('40 tickets are already held on this performance, so its capacity cannot be 30')
  })

  test('closing a house that has sold reads the same way, in the singular', () => {
    expect(loweringRefusal(0, 1))
      .toBe('1 ticket is already held on this performance, so its capacity cannot be 0')
  })
})
