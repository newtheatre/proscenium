import { describe, expect, test } from 'bun:test'
import { amountDueFor, collectForm, deskSearchForm, uncollectableReason } from '#shared/utils/desk'

// D-114 as pure rules. The database enforcement (the ticket-collection-once guard) is in
// tests/integration/desk.test.ts; the full desk flow is tests/e2e/desk.test.ts.

describe('a booking is collectable only while PENDING (criterion 2)', () => {
  test('PENDING has nothing to refuse', () => {
    expect(uncollectableReason('PENDING')).toBeNull()
  })

  test('every other status refuses, each in its own words', () => {
    const reasons = ['COLLECTED', 'DOOR', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].map(status => uncollectableReason(status))
    expect(reasons.every(reason => typeof reason === 'string' && reason.length > 0)).toBe(true)
    expect(new Set(reasons).size).toBe(reasons.length)
  })

  test('an unrecognised status still says something rather than nothing', () => {
    expect(uncollectableReason('SOMETHING_NEW')).toContain('cannot be collected')
  })
})

describe('what is due now depends on the tender (criterion 4)', () => {
  test('a comp is due nothing, whatever the tickets cost', () => {
    expect(amountDueFor('COMP', 1800)).toBe(0)
  })

  test('a card charges the real total', () => {
    expect(amountDueFor('CARD', 1800)).toBe(1800)
  })
})

describe('a comp needs a reason; a card needs nothing else', () => {
  test('CARD with no reason is a well-formed request', () => {
    expect(collectForm.safeParse({ reservationId: 'r-1', expectedTotalPence: 900, tender: 'CARD' }).success).toBe(true)
  })

  test('COMP with no reason is refused before it reaches the route', () => {
    expect(collectForm.safeParse({ reservationId: 'r-1', expectedTotalPence: 0, tender: 'COMP' }).success).toBe(false)
  })

  test('COMP with a reason is well-formed', () => {
    expect(collectForm.safeParse({ reservationId: 'r-1', expectedTotalPence: 0, tender: 'COMP', compReason: 'Reviewer' }).success).toBe(true)
  })

  test('a tender outside CARD or COMP is refused: the theatre takes no cash', () => {
    expect(collectForm.safeParse({ reservationId: 'r-1', expectedTotalPence: 900, tender: 'CASH' }).success).toBe(false)
  })
})

describe('the search request is scoped to one performance (criterion 1)', () => {
  test('a performance id is required; a search term is not', () => {
    expect(deskSearchForm.safeParse({ performanceId: 'p-1' }).success).toBe(true)
    expect(deskSearchForm.safeParse({ q: 'Alex' }).success).toBe(false)
  })
})
