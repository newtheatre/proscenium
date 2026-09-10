import { describe, expect, test } from 'bun:test'
import { declineTicketCompRequestForm, ticketCompRequestExpired, ticketCompRequestForm } from '#shared/utils/ticket-comps'

// Ticket comps by request and approval, before collection (D-117). The database write path has
// its own tests in `tests/e2e/ticket-comps.test.ts`; this is the pure vocabulary and validation.

describe('a comp request names a booking and a reason (criterion 1)', () => {
  test('a reservation id and a reason is accepted', () => {
    expect(ticketCompRequestForm.safeParse({ reservationId: 'r-1', reason: 'Front of house guest tonight' }).success).toBe(true)
  })

  test('an empty reason is refused', () => {
    expect(ticketCompRequestForm.safeParse({ reservationId: 'r-1', reason: '' }).success).toBe(false)
  })

  test('a whitespace-only reason is refused', () => {
    expect(ticketCompRequestForm.safeParse({ reservationId: 'r-1', reason: '   ' }).success).toBe(false)
  })

  test('no reservation id is refused', () => {
    expect(ticketCompRequestForm.safeParse({ reservationId: '', reason: 'Something' }).success).toBe(false)
  })

  test('a basket line would be a different story entirely, and is refused', () => {
    expect(ticketCompRequestForm.safeParse({ reservationId: 'r-1', reason: 'Something', lines: [] }).success).toBe(false)
  })
})

describe('a decline needs a reason (criterion 5)', () => {
  test('a reason is accepted', () => {
    expect(declineTicketCompRequestForm.safeParse({ reason: 'Past tonight\'s comp allowance' }).success).toBe(true)
  })

  test('no reason is refused', () => {
    expect(declineTicketCompRequestForm.safeParse({}).success).toBe(false)
  })
})

describe('a pending request expires at read time, never by a sweep (criterion 2)', () => {
  const TEN_MINUTES = 10
  const createdAt = 1_000_000

  test('inside the window it has not expired', () => {
    expect(ticketCompRequestExpired(createdAt, TEN_MINUTES, new Date((createdAt + 5 * 60) * 1000))).toBe(false)
  })

  test('past the window it has', () => {
    expect(ticketCompRequestExpired(createdAt, TEN_MINUTES, new Date((createdAt + 11 * 60) * 1000))).toBe(true)
  })

  test('at the exact boundary it has not, the window is inclusive of the moment itself', () => {
    expect(ticketCompRequestExpired(createdAt, TEN_MINUTES, new Date((createdAt + 10 * 60) * 1000))).toBe(false)
  })
})
