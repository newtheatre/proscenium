import { isCollected } from '~~/shared/utils/bookingStanding'

/**
 * Nothing is paid until the tickets are collected (ADR-0011): PENDING edits
 * freely, COLLECTED/DOOR refunds only, CANCELLED/NO_SHOW neither.
 */

// The standing itself is in shared/utils/bookingStanding.ts, where a browser
// screen can read the same rule.

/**
 * Guard for the ticket-diff routes. Throws unless the reservation is still
 * `PENDING`.
 */
export function assertTicketsEditable(status: string): void {
  if (isCollected(status)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'These tickets have already been collected and paid for, so they can no longer be changed. A manager can refund them instead.',
    })
  }
  if (status !== 'PENDING') {
    throw createError({
      statusCode: 409,
      statusMessage: `This booking is ${status.toLowerCase().replace('_', ' ')}, so its tickets can no longer be changed.`,
    })
  }
}

/**
 * Guard for the refund route. Throws unless the reservation has been collected,
 * or was cancelled with money still on it (ADR-0039).
 */
export function assertRefundable(status: string, strandedPayment = false): void {
  if (isCollected(status)) return
  if (status === 'CANCELLED' && strandedPayment) return

  if (status === 'PENDING') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Nothing has been paid for this booking yet, so there is nothing to refund. Change the tickets on the booking instead.',
    })
  }
  throw createError({
    statusCode: 409,
    statusMessage: `This booking is ${status.toLowerCase().replace('_', ' ')} and was never collected, so there is nothing to refund.`,
  })
}
