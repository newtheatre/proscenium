import { describe, expect, test } from 'bun:test'
import { readBookableTicketTypes } from '#server/utils/reservations'
import {
  RESERVATION_REFERENCE_LENGTH,
  generateReservationReference,
  overCapReason,
  reservationForm,
  totalTickets,
} from '#shared/utils/reservations'
import type { BookableTicketTypeRow } from '#server/utils/reservations'

// D-104 as pure rules. What the database enforces is in tests/integration/capacity.test.ts, and
// the contended case is the named race in tests/integration/races-capacity.test.ts.

describe('a reservation reference is short, no-look-alike and never a credential', () => {
  test('every character comes from the no-look-alike alphabet, at the fixed length', () => {
    for (let i = 0; i < 200; i += 1) {
      const reference = generateReservationReference()
      expect(reference).toHaveLength(RESERVATION_REFERENCE_LENGTH)
      expect(reference).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/)
    }
  })

  test('two references are not the same call answered twice', () => {
    const references = new Set(Array.from({ length: 50 }, () => generateReservationReference()))
    expect(references.size).toBeGreaterThan(1)
  })
})

describe('the per-order cap applies per line and to the total (criterion 2)', () => {
  test('a single line over the cap is refused even though it is the whole order', () => {
    expect(overCapReason([{ quantity: 11 }], 10)).not.toBeNull()
  })

  test('lines that individually fit but sum over the cap are refused', () => {
    expect(overCapReason([{ quantity: 6 }, { quantity: 5 }], 10)).not.toBeNull()
  })

  test('an order at exactly the cap is allowed', () => {
    expect(overCapReason([{ quantity: 4 }, { quantity: 6 }], 10)).toBeNull()
  })

  test('totalTickets sums every line', () => {
    expect(totalTickets([{ quantity: 2 }, { quantity: 3 }])).toBe(5)
  })
})

describe('the request shape (criterion 1, 5)', () => {
  test('a guest checkout needs a name and an email; a session carries neither', () => {
    const parsed = reservationForm.safeParse({
      performanceId: 'p-1',
      lines: [{ ticketTypeId: 't-1', quantity: 1 }],
      guest: { name: 'Alex Booker', email: 'alex@example.invalid' },
    })
    expect(parsed.success).toBe(true)
  })

  test('guest is optional: a signed-in booker sends none', () => {
    const parsed = reservationForm.safeParse({
      performanceId: 'p-1',
      lines: [{ ticketTypeId: 't-1', quantity: 1 }],
    })
    expect(parsed.success).toBe(true)
  })

  test('a ticket type appears once: two lines for the same type are refused', () => {
    const parsed = reservationForm.safeParse({
      performanceId: 'p-1',
      lines: [{ ticketTypeId: 't-1', quantity: 1 }, { ticketTypeId: 't-1', quantity: 1 }],
    })
    expect(parsed.success).toBe(false)
  })

  test('an unknown field is refused: the shape is closed', () => {
    const parsed = reservationForm.safeParse({
      performanceId: 'p-1',
      lines: [{ ticketTypeId: 't-1', quantity: 1 }],
      expectedTotalPence: 900,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('a bookable price resolves the same chain the public listing does', () => {
  const row = (overrides: Partial<BookableTicketTypeRow> = {}): BookableTicketTypeRow => ({
    id: 'tt-standard',
    name: 'Standard',
    description: null,
    basePrice: 900,
    activeByDefault: 1,
    showPrice: null,
    showActive: null,
    performancePrice: null,
    performanceActive: null,
    ...overrides,
  })

  test('with no override, the base price and default activity resolve', () => {
    const [resolved] = readBookableTicketTypes([row()])
    expect(resolved?.price).toBe(900)
    expect(resolved?.source).toBe('BASE')
  })

  test('a performance override wins over a show override', () => {
    const [resolved] = readBookableTicketTypes([row({ showPrice: 700, showActive: 1, performancePrice: 500, performanceActive: 1 })])
    expect(resolved?.price).toBe(500)
    expect(resolved?.source).toBe('PERFORMANCE')
  })

  test('a type deactivated at every level offering it is not bookable at all', () => {
    const resolved = readBookableTicketTypes([row({ activeByDefault: 0 })])
    expect(resolved).toEqual([])
  })
})
