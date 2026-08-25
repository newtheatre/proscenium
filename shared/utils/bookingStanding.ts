/**
 * Nothing is paid until the tickets are collected (ADR-0011). In shared/ so a
 * browser screen can answer the question with the rule the server uses.
 */

/** Statuses meaning the customer has the tickets and has paid. */
export const COLLECTED_STATUSES = ['COLLECTED', 'DOOR'] as const

export function isCollected(status: string): boolean {
  return (COLLECTED_STATUSES as readonly string[]).includes(status)
}

/** What the door needs to know about a booking, in one word. */
export type BookingPaymentState = 'PAID' | 'UNPAID' | 'CANCELLED' | 'NO_SHOW'

export interface BookingStanding {
  state: BookingPaymentState
  /** Unrefunded tickets: how many people to expect through. */
  partySize: number
  /** Zero unless the state is UNPAID. Pence, like everything else. */
  amountOwedPence: number
}

/**
 * The single answer to "is this paid?", derived from the lifecycle rather than
 * re-read per screen. The door, the scanner and the till all call this one.
 */
export function bookingStanding(
  reservation: { status: string, tickets: Array<{ pricePaid: number, refundedAt: Date | string | null }> },
): BookingStanding {
  const live = reservation.tickets.filter(ticket => !ticket.refundedAt)
  const partySize = live.length

  if (reservation.status === 'CANCELLED') return { state: 'CANCELLED', partySize, amountOwedPence: 0 }
  if (reservation.status === 'NO_SHOW') return { state: 'NO_SHOW', partySize, amountOwedPence: 0 }
  // Collection is the payment boundary (ADR-0011), so it is also the answer.
  if (isCollected(reservation.status)) return { state: 'PAID', partySize, amountOwedPence: 0 }

  return {
    state: 'UNPAID',
    partySize,
    amountOwedPence: live.reduce((total, ticket) => total + ticket.pricePaid, 0),
  }
}
