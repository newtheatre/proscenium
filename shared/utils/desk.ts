import { z } from 'zod'
import { guestDetailsForm } from './reservations'
import { pageQuery } from './pagination'
import { saysPrice } from './ticket-types'

// D-114: finding a booking at the desk and taking payment for it. Collection is the payment
// boundary (criterion 2); this file is the pure shape of what crosses it.

// The theatre takes no cash and never initiates a charge (0005, criterion 4): CARD is read out
// to the SumUp reader by hand, COMP is a zero-value entry with a reason.
export const DESK_TENDERS = ['CARD', 'COMP'] as const
export type DeskTender = (typeof DESK_TENDERS)[number]

export const deskSearchForm = pageQuery.extend({
  performanceId: z.string().trim().min(1),
  q: z.string().trim().max(200).optional(),
})

export type DeskSearchInput = z.output<typeof deskSearchForm>

// No `reservationId` here: the one route that validates this takes it from the URL, and a
// refined schema cannot be `.omit()`, so it is never part of the body's own shape at all.
export const collectForm = z.object({
  // In pence, re-checked against the server's own sum (criterion 3): a human reads this off
  // the screen into the reader, so it must never silently drift from what is actually charged.
  expectedTotalPence: z.number().int().min(0),
  tender: z.enum(DESK_TENDERS),
  // Names an approved request (D-117); the reason lives there, never typed here.
  compRequestId: z.string().trim().min(1).optional(),
}).refine(
  input => input.tender !== 'COMP' || input.compRequestId !== undefined,
  { path: ['compRequestId'], message: 'A comp needs an approved request' },
)

export type CollectInput = z.output<typeof collectForm> & { reservationId: string }

// What a booking's own status says about whether it can be collected right now, in the
// booker-facing words the desk screen shows. Null means it can.
export function uncollectableReason(status: string): string | null {
  switch (status) {
    case 'PENDING':
      return null
    case 'COLLECTED':
      return 'This booking has already been collected.'
    case 'DOOR':
      return 'This booking was already admitted at the door.'
    case 'CANCELLED':
      return 'This booking was cancelled and cannot be collected. Reinstate it below if it still can be.'
    case 'EXPIRED':
      return 'This hold has lapsed. Reinstate it below if the seats are still free.'
    case 'NO_SHOW':
      return 'This booking was recorded as a no-show and cannot be collected.'
    default:
      return `This booking is ${status.toLowerCase()} and cannot be collected.`
  }
}

// D-115 criterion 3: a structural ceiling on one line, not a workshop number; the order total
// carries no cap at all, which is the whole point of a walk-up sale.
export const DESK_SALE_LINE_QUANTITY_CAP = 20
const MAX_DESK_SALE_LINES = 20

export const deskSaleLineForm = z.object({
  ticketTypeId: z.string().trim().min(1),
  quantity: z.number().int().positive().max(DESK_SALE_LINE_QUANTITY_CAP),
})

// A name and an email, the same two fields D-104's guest checkout takes: nothing about a walk-up
// needs to be anonymous, and it is what keeps this reservation findable by search like any other.
export const deskSaleForm = z.strictObject({
  performanceId: z.string().trim().min(1),
  lines: z.array(deskSaleLineForm).min(1).max(MAX_DESK_SALE_LINES)
    .refine(
      lines => new Set(lines.map(line => line.ticketTypeId)).size === lines.length,
      'A ticket type appears once; add to its quantity instead of a second line',
    ),
  guest: guestDetailsForm,
  expectedTotalPence: z.number().int().min(0),
  // COMP is excluded here: D-117's request-and-approval workflow names an existing reservation,
  // which a walk-up does not have until this write creates one.
  tender: z.literal('CARD'),
})

export type DeskSaleInput = z.output<typeof deskSaleForm>

// A comp records nothing charged; the reader takes the real figure. Either way this is what the
// screen shows as due before the officer confirms it (criterion 3).
export function amountDueFor(tender: DeskTender, ticketTotalPence: number): number {
  return tender === 'COMP' ? 0 : ticketTotalPence
}

// D-116 criterion 1: money is handed back the same way it was taken, in person; the reader shows
// the figure and this is what refuses a mismatch before anything writes, quoting both.
export const refundTicketForm = z.strictObject({
  expectedTotalPence: z.number().int().min(0),
})

export type RefundTicketInput = z.output<typeof refundTicketForm>

// D-116 criterion 6: a booking still holding unrefunded money is refused, not silently allowed.
export function strandedMoneyReason(strandedPence: number): string | null {
  if (strandedPence <= 0) return null
  return `${saysPrice(strandedPence)} is still unrefunded on this booking. Refund every ticket first, then cancel.`
}

export const REINSTATE_REASON_LIMIT = 200

export const reinstateReservationForm = z.strictObject({
  reason: z.string().trim().min(1, 'A reason is required').max(REINSTATE_REASON_LIMIT),
})

export type ReinstateReservationInput = z.output<typeof reinstateReservationForm>

// Criteria 1 and 5 as one predicate: an expired hold or the booker's own cancellation, never a
// staff cancellation, which only ever follows a refund (D-116) and so is never a hold to bring back.
export function reinstateRefusal(status: string, cancelledBy: string | null): string | null {
  if (status === 'EXPIRED') return null
  if (status === 'CANCELLED' && cancelledBy === 'CUSTOMER') return null
  if (status === 'CANCELLED') {
    return 'This booking was refunded and cancelled at the desk: reinstating it would bring back a sale that was already handed back. Take a new booking instead.'
  }
  return `This booking is ${status.toLowerCase()} and cannot be reinstated.`
}
