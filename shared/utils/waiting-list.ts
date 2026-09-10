import { z } from 'zod'
import { guestDetailsForm, reservationLineForm } from './reservations'

// The waiting list for a sold-out performance (D-113): join with a party size, get offered seats
// in join order as they free, claim through the same write path an ordinary booking uses.

export const WAITING_LIST_STATUSES = ['WAITING', 'OFFERED', 'CLAIMED', 'LAPSED', 'REMOVED'] as const
export type WaitingListStatus = (typeof WAITING_LIST_STATUSES)[number]

// A structural ceiling: `PUBLIC_ORDER_SEAT_CAP` still governs what the claim itself may book.
const MAX_PARTY_SIZE = 10
const MAX_CLAIM_LINES = 20

export const joinWaitingListForm = z.strictObject({
  performanceId: z.string().trim().min(1),
  partySize: z.number().int().positive().max(MAX_PARTY_SIZE),
  // Ignored when the request carries a session; required otherwise, exactly as booking is (D-104).
  guest: guestDetailsForm.optional(),
})

export type JoinWaitingListInput = z.output<typeof joinWaitingListForm>

// The offer's own booking step: which types, how many, the same shape a fresh reservation uses.
export const claimWaitingListOfferForm = z.strictObject({
  lines: z.array(reservationLineForm).min(1).max(MAX_CLAIM_LINES)
    .refine(
      lines => new Set(lines.map(line => line.ticketTypeId)).size === lines.length,
      'A ticket type appears once; add to its quantity instead of a second line',
    ),
})

export type ClaimWaitingListOfferInput = z.output<typeof claimWaitingListOfferForm>

// An offer never outlives the performance it is for, whatever the configured window says: a link
// promising a seat for a show already under way is nonsense (criterion 2 interpretation, 0014).
export function offerExpiresAt(now: number, windowMinutes: number, startsAt: number): number {
  return Math.min(now + windowMinutes * 60, startsAt)
}

// Mirrors `bornExpiredReason` (D-106): an offer with no time left to stand is not made at all,
// left `WAITING` for the next sweep to reconsider rather than offered and immediately lapsed.
export function offerWouldBeBornExpired(expiresAt: number, now: number): boolean {
  return expiresAt <= now
}

// Criterion 2's claim commits to the party size the offer was extended for, not a lesser or
// greater number: fewer seats is a self-service edit (D-110) once the booking exists.
export function partySizeMismatchReason(requested: number, partySize: number): string | null {
  if (requested === partySize) return null
  return `This offer is for ${partySize === 1 ? '1 seat' : `${partySize} seats`}; the request asked for ${requested}.`
}
