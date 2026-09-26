import { describe, expect, test } from 'bun:test'
import {
  MAX_PARTY_SIZE,
  claimWaitingListOfferForm,
  joinWaitingListForm,
  offerExpiresAt,
  offerWouldBeBornExpired,
  partySizeMismatchReason,
  waitingListGuestJoinForm,
  waitingListPartyForm,
} from '#shared/utils/waiting-list'

// D-113 as pure rules. The database rule (the active-only unique index, the race-safe claim) is
// tests/integration/waiting-list.test.ts, against the real migrations.

describe('an offer never outlives online booking (criterion 2, issue 1328)', () => {
  const NOW = 1_800_000_000

  test('stands for the configured window when the cut-off is well ahead', () => {
    expect(offerExpiresAt(NOW, 120, NOW + 100_000)).toBe(NOW + 120 * 60)
  })

  // The cut-off is the hold release or the booking window, whichever is first: a claim after it
  // is refused, so an offer standing past it would promise what the write path will not give.
  test('is capped at the online cut-off when the window would run past it', () => {
    const closesAt = NOW + 45 * 60
    expect(offerExpiresAt(NOW, 120, closesAt)).toBe(closesAt)
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

// Issue 1152 item 5: the join screen validated only blanks, and the exchange list named nights
// with no date on them.
describe('the join screen validates before it asks (criterion 1)', () => {
  test('a guest needs a name and an address, in the house\'s words', () => {
    const blank = waitingListGuestJoinForm.safeParse({ partySize: 1, name: '  ', email: '' })
    expect(blank.success).toBe(false)
    const said = blank.success ? [] : blank.error.issues.map(issue => issue.message)
    expect(said).toContain('Tell us the name to hold the place under.')
    expect(said).toContain('Tell us where to send the offer.')
    for (const message of said) expect(message).not.toContain('Invalid')
  })

  test('an address that is not one is refused on its own field', () => {
    const wrong = waitingListGuestJoinForm.safeParse({ partySize: 2, name: 'Masha', email: 'not-an-address' })
    expect(wrong.success).toBe(false)
    const paths = wrong.success ? [] : wrong.error.issues.map(issue => issue.path.join('.'))
    expect(paths).toEqual(['email'])
  })

  test('a party of none and a party over the ceiling are both refused', () => {
    expect(waitingListPartyForm.safeParse({ partySize: 0 }).success).toBe(false)
    expect(waitingListPartyForm.safeParse({ partySize: MAX_PARTY_SIZE + 1 }).success).toBe(false)
    expect(waitingListPartyForm.safeParse({ partySize: MAX_PARTY_SIZE }).success).toBe(true)
  })

  test('a signed-in booker gives a party size and nothing else', () => {
    expect(waitingListPartyForm.safeParse({ partySize: 3 }).success).toBe(true)
  })
})
