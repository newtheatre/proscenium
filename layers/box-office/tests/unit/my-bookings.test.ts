// My tickets groups a person's bookings by performance: the night is the unit.
import { describe, expect, it } from 'vitest'
import { byPerformance, type MyVisit } from '../../app/utils/my-bookings'

const visit = (orderId: string, performanceId: string): MyVisit => ({
  orderId,
  reference: orderId.toUpperCase(),
  state: 'confirmed',
  currency: 'GBP',
  amountDueMinor: 0,
  performance: { id: performanceId, startsAt: 0, endsAt: 0, venue: 'Main House', state: 'scheduled' },
  production: { title: 'Hamlet', slug: 'hamlet' },
  tickets: [],
})

describe('byPerformance', () => {
  it('puts bookings for one performance on one night, keeping the order they came in', () => {
    const nights = byPerformance([visit('a', 'p1'), visit('b', 'p2'), visit('c', 'p1')])
    expect(nights.map(n => [n.performance.id, n.bookings.map(b => b.orderId)])).toEqual([['p1', ['a', 'c']], ['p2', ['b']]])
  })

  it('answers nothing for no bookings', () => {
    expect(byPerformance([])).toEqual([])
  })
})
