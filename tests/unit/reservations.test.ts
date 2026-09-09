import { describe, expect, test } from 'bun:test'
import { readBookableTicketTypes } from '#server/utils/reservations'
import {
  RESERVATION_REFERENCE_LENGTH,
  generateReservationReference,
  looksLikeReference,
  overCapReason,
  qrStatusDisplay,
  reservationForm,
  reservationResendForm,
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
    restrictedTo: null,
    ...overrides,
  })

  test('with no override, the base price and default activity resolve', () => {
    const [resolved] = readBookableTicketTypes([row()], false)
    expect(resolved?.price).toBe(900)
    expect(resolved?.source).toBe('BASE')
  })

  test('a performance override wins over a show override', () => {
    const [resolved] = readBookableTicketTypes([row({ showPrice: 700, showActive: 1, performancePrice: 500, performanceActive: 1 })], false)
    expect(resolved?.price).toBe(500)
    expect(resolved?.source).toBe('PERFORMANCE')
  })

  test('a type deactivated at every level offering it is not bookable at all', () => {
    const resolved = readBookableTicketTypes([row({ activeByDefault: 0 })], false)
    expect(resolved).toEqual([])
  })

  test('a member-restricted type is dropped for a caller who is not one (D-109 criterion 1)', () => {
    const resolved = readBookableTicketTypes([row({ restrictedTo: 'MEMBER' })], false)
    expect(resolved).toEqual([])
  })

  test('a member-restricted type is offered to a current member', () => {
    const [resolved] = readBookableTicketTypes([row({ restrictedTo: 'MEMBER' })], true)
    expect(resolved?.id).toBe('tt-standard')
  })

  test('an unrestricted type is offered either way', () => {
    expect(readBookableTicketTypes([row()], false)).toHaveLength(1)
    expect(readBookableTicketTypes([row()], true)).toHaveLength(1)
  })
})

describe('what the QR answers, loudly distinct per state (D-108 criterion 5)', () => {
  test('unpaid names the amount due', () => {
    expect(qrStatusDisplay('PENDING', null, '£9.00')).toEqual({ headline: 'Unpaid', detail: '£9.00 due at the box office on the night.' })
  })

  test('paid and admitted read differently from each other', () => {
    expect(qrStatusDisplay('COLLECTED', null, null).headline).toBe('Paid')
    expect(qrStatusDisplay('DOOR', null, null).headline).toBe('Admitted')
  })

  test('a cancellation names who cancelled', () => {
    expect(qrStatusDisplay('CANCELLED', 'CUSTOMER', null).detail).toContain('booker')
    expect(qrStatusDisplay('CANCELLED', 'STAFF', null).detail).toContain('box office')
  })

  test('a lapsed hold reads distinctly from a cancellation', () => {
    expect(qrStatusDisplay('EXPIRED', null, null).headline).not.toBe(qrStatusDisplay('CANCELLED', null, null).headline)
  })
})

describe('a resend is asked for by reference and email, not a token (criterion 2)', () => {
  test('a well-formed reference and address parse', () => {
    const parsed = reservationResendForm.safeParse({ reference: 'ABCDEF', email: 'alex@example.invalid' })
    expect(parsed.success).toBe(true)
  })

  test('the wrong reference length is refused before any lookup happens', () => {
    const parsed = reservationResendForm.safeParse({ reference: 'AB', email: 'alex@example.invalid' })
    expect(parsed.success).toBe(false)
  })
})

describe('a reference is told from a name by its alphabet, not just its length (D-114 criterion 1)', () => {
  test('a generated reference always looks like one', () => {
    for (let i = 0; i < 50; i += 1) expect(looksLikeReference(generateReservationReference())).toBe(true)
  })

  test('a six-letter name is not mistaken for a reference: O is not in the alphabet', () => {
    expect(looksLikeReference('Booker')).toBe(false)
  })

  test('the wrong length is never a reference, however plausible its letters', () => {
    expect(looksLikeReference('ABCDE')).toBe(false)
    expect(looksLikeReference('ABCDEFG')).toBe(false)
  })
})
