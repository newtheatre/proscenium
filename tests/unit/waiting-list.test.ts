import { describe, expect, test } from 'bun:test'
import {
  claimWaitingListOfferForm,
  joinWaitingListForm,
  offerExpiresAt,
  offerWouldBeBornExpired,
  partySizeMismatchReason,
} from '#shared/utils/waiting-list'

// D-113 as pure rules. The database rule (the active-only unique index, the race-safe claim) is
// tests/integration/waiting-list.test.ts, against the real migrations.

describe('an offer never outlives its performance (criterion 2)', () => {
  const NOW = 1_800_000_000

  test('stands for the configured window when curtain is well ahead', () => {
    expect(offerExpiresAt(NOW, 120, NOW + 100_000)).toBe(NOW + 120 * 60)
  })

  test('is capped at curtain when the window would run past it', () => {
    const startsAt = NOW + 60 * 60
    expect(offerExpiresAt(NOW, 120, startsAt)).toBe(startsAt)
  })

  test('an offer with no time left to stand is born expired', () => {
    expect(offerWouldBeBornExpired(NOW, NOW)).toBe(true)
    expect(offerWouldBeBornExpired(NOW - 1, NOW)).toBe(true)
    expect(offerWouldBeBornExpired(NOW + 1, NOW)).toBe(false)
  })
})

describe('a claim commits to the party size the offer was extended for', () => {
  test('the exact number is accepted', () => {
    expect(partySizeMismatchReason(3, 3)).toBeNull()
  })

  test('fewer or more is refused, naming both figures', () => {
    expect(partySizeMismatchReason(2, 3)).toContain('3')
    expect(partySizeMismatchReason(4, 3)).toContain('3')
  })
})

describe('joinWaitingListForm', () => {
  test('accepts a party of one to ten', () => {
    expect(joinWaitingListForm.safeParse({ performanceId: 'p-1', partySize: 1 }).success).toBe(true)
    expect(joinWaitingListForm.safeParse({ performanceId: 'p-1', partySize: 10 }).success).toBe(true)
  })

  test('refuses zero, negative and over-large parties', () => {
    expect(joinWaitingListForm.safeParse({ performanceId: 'p-1', partySize: 0 }).success).toBe(false)
    expect(joinWaitingListForm.safeParse({ performanceId: 'p-1', partySize: -1 }).success).toBe(false)
    expect(joinWaitingListForm.safeParse({ performanceId: 'p-1', partySize: 11 }).success).toBe(false)
  })

  test('takes a guest name and email when offered', () => {
    const result = joinWaitingListForm.safeParse({
      performanceId: 'p-1',
      partySize: 2,
      guest: { name: 'Alex Booker', email: 'alex@example.invalid' },
    })
    expect(result.success).toBe(true)
  })
})

describe('claimWaitingListOfferForm', () => {
  test('refuses the same ticket type on two lines', () => {
    const result = claimWaitingListOfferForm.safeParse({
      lines: [
        { ticketTypeId: 'tt-1', quantity: 1 },
        { ticketTypeId: 'tt-1', quantity: 1 },
      ],
    })
    expect(result.success).toBe(false)
  })

  test('accepts distinct types', () => {
    const result = claimWaitingListOfferForm.safeParse({
      lines: [
        { ticketTypeId: 'tt-1', quantity: 1 },
        { ticketTypeId: 'tt-2', quantity: 2 },
      ],
    })
    expect(result.success).toBe(true)
  })
})
