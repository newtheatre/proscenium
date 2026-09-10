import { describe, expect, test } from 'bun:test'
import { readBookableTicketTypes } from '#server/utils/reservations'
import {
  RESERVATION_REFERENCE_LENGTH,
  belowMinimumTicketsReason,
  doorTicketOutcome,
  generateReservationReference,
  looksLikeReference,
  overCapReason,
  pastCurtainReason,
  qrStatusDisplay,
  reservationEditForm,
  reservationExchangeForm,
  reservationForm,
  reservationResendForm,
  ticketEditDelta,
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
    accessKind: null,
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

  test('an exchanged booking reads distinctly from an ordinary cancellation (D-111 criterion 4)', () => {
    const exchanged = qrStatusDisplay('CANCELLED', 'CUSTOMER', null, { showTitle: 'A Different Show', when: 'Friday' })
    expect(exchanged.headline).toBe('Exchanged')
    expect(exchanged.headline).not.toBe(qrStatusDisplay('CANCELLED', 'CUSTOMER', null).headline)
    expect(exchanged.detail).toContain('A Different Show')
  })
})

describe('the door\'s own fifth state, wrong performance (E-127 criterion 3, D-108 criterion 5)', () => {
  test('a paid ticket for the performance selected admits', () => {
    const outcome = doorTicketOutcome('COLLECTED', null, 'perf-matinee', 'perf-matinee', 'The Seagull', 'Friday, 2pm', null)
    expect(outcome).toEqual({ headline: 'Admit', detail: null, admit: true })
  })

  test('a paid ticket for a different performance refuses loudly, naming the correct one', () => {
    const outcome = doorTicketOutcome('COLLECTED', null, 'perf-matinee', 'perf-evening', 'The Seagull', 'Friday, 2pm', null)
    expect(outcome.admit).toBe(false)
    expect(outcome.headline).toBe('Wrong performance')
    expect(outcome.detail).toBe('This ticket is for The Seagull, Friday, 2pm.')
  })

  test('an unpaid ticket for the right performance still refuses, quoting the amount due', () => {
    const outcome = doorTicketOutcome('PENDING', null, 'perf-matinee', 'perf-matinee', 'The Seagull', 'Friday, 2pm', '£9.00')
    expect(outcome.admit).toBe(false)
    expect(outcome.headline).toBe('Unpaid')
  })

  test('wrong performance takes priority over an unpaid ticket: the door only owes one answer', () => {
    const outcome = doorTicketOutcome('PENDING', null, 'perf-matinee', 'perf-evening', 'The Seagull', 'Friday, 2pm', '£9.00')
    expect(outcome.headline).toBe('Wrong performance')
  })

  test('a cancelled, lapsed or already-admitted ticket explains itself regardless of performance', () => {
    expect(doorTicketOutcome('CANCELLED', 'CUSTOMER', 'perf-matinee', 'perf-evening', 'The Seagull', 'Friday, 2pm', null).headline).toBe('Cancelled')
    expect(doorTicketOutcome('EXPIRED', null, 'perf-matinee', 'perf-evening', 'The Seagull', 'Friday, 2pm', null).headline).toBe('Lapsed')
    expect(doorTicketOutcome('DOOR', null, 'perf-matinee', 'perf-evening', 'The Seagull', 'Friday, 2pm', null).headline).toBe('Admitted')
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

describe('D-110: what changes to reach the desired ticket counts (criterion 1)', () => {
  test('a type not currently held that becomes wanted is an addition', () => {
    const delta = ticketEditDelta([], [{ ticketTypeId: 'standard', quantity: 2 }])
    expect(delta.additions).toEqual([{ ticketTypeId: 'standard', quantity: 2 }])
    expect(delta.removals).toEqual([])
    expect(delta.desiredTotal).toBe(2)
  })

  test('a held type dropped from the desired lines is a removal of everything held', () => {
    const delta = ticketEditDelta([{ ticketTypeId: 'standard', quantity: 3 }], [])
    expect(delta.removals).toEqual([{ ticketTypeId: 'standard', quantity: 3 }])
    expect(delta.additions).toEqual([])
  })

  test('raising one type and lowering another in the same request nets both independently', () => {
    const delta = ticketEditDelta(
      [{ ticketTypeId: 'standard', quantity: 2 }, { ticketTypeId: 'concession', quantity: 1 }],
      [{ ticketTypeId: 'standard', quantity: 3 }, { ticketTypeId: 'concession', quantity: 0 }],
    )
    expect(delta.additions).toEqual([{ ticketTypeId: 'standard', quantity: 1 }])
    expect(delta.removals).toEqual([{ ticketTypeId: 'concession', quantity: 1 }])
    expect(delta.desiredTotal).toBe(3)
  })

  test('an unchanged type moves nowhere', () => {
    const delta = ticketEditDelta([{ ticketTypeId: 'standard', quantity: 2 }], [{ ticketTypeId: 'standard', quantity: 2 }])
    expect(delta.additions).toEqual([])
    expect(delta.removals).toEqual([])
  })
})

describe('D-110: a booking keeps at least one ticket (criterion 2)', () => {
  test('a desired total of zero is refused', () => {
    expect(belowMinimumTicketsReason(0)).not.toBeNull()
  })

  test('one or more is fine', () => {
    expect(belowMinimumTicketsReason(1)).toBeNull()
  })
})

describe('D-110: self-cancel is refused once the performance has started (criterion 3)', () => {
  test('before curtain is fine', () => {
    expect(pastCurtainReason(2_000, 1_000)).toBeNull()
  })

  test('at or after curtain is refused', () => {
    expect(pastCurtainReason(1_000, 1_000)).not.toBeNull()
    expect(pastCurtainReason(1_000, 2_000)).not.toBeNull()
  })
})

describe('D-110: the edit form matches the booking form\'s own line shape (criterion 1)', () => {
  test('a well-formed set of lines parses', () => {
    const parsed = reservationEditForm.safeParse({ lines: [{ ticketTypeId: 'standard', quantity: 2 }] })
    expect(parsed.success).toBe(true)
  })

  test('a type appearing twice is refused before it reaches the database', () => {
    const parsed = reservationEditForm.safeParse({
      lines: [{ ticketTypeId: 'standard', quantity: 1 }, { ticketTypeId: 'standard', quantity: 1 }],
    })
    expect(parsed.success).toBe(false)
  })

  test('no lines at all is refused: cancel is the route for that, not an empty edit', () => {
    const parsed = reservationEditForm.safeParse({ lines: [] })
    expect(parsed.success).toBe(false)
  })
})

describe('D-111: exchange asks for a target performance and nothing else', () => {
  test('a performance id parses', () => {
    expect(reservationExchangeForm.safeParse({ performanceId: 'perf-1' }).success).toBe(true)
  })

  test('an empty id is refused', () => {
    expect(reservationExchangeForm.safeParse({ performanceId: '' }).success).toBe(false)
  })
})
