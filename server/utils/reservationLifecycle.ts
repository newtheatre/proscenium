/**
 * When a reservation's tickets may be changed, and when money may be given back.
 *
 * The rule, in the theatre's terms: **nothing has been paid until the tickets
 * are collected.** So there are two distinct phases, and they use different
 * mechanisms:
 *
 * - **Before collection** (`PENDING`) the booking is just an intention. The
 *   customer or the box office can add and remove tickets freely; removing one
 *   is not a refund, because nothing was taken. This is `PUT .../tickets`.
 * - **After collection** (`COLLECTED`, `DOOR`) money has changed hands and the
 *   tickets are in someone's hand. The composition is now a record of a
 *   transaction, so it must not be edited — the only way to reverse any part of
 *   it is a refund, which is a manager's decision and leaves an audit trail.
 *   This is `POST .../refund`.
 *
 * Keeping both doors open at once is what made refunds unsafe: a collected
 * booking could be quietly re-diffed, deleting tickets that had been paid for
 * with no record that anything was returned, while a `PENDING` booking could be
 * "refunded" for money the theatre had never taken.
 *
 * `CANCELLED` and `NO_SHOW` are terminal for both operations.
 */

/** Statuses meaning the customer has the tickets and has paid. */
export const COLLECTED_STATUSES = ['COLLECTED', 'DOOR'] as const

export function isCollected(status: string): boolean {
  return (COLLECTED_STATUSES as readonly string[]).includes(status)
}

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
 * Guard for the refund route. Throws unless the reservation has been collected.
 */
export function assertRefundable(status: string): void {
  if (isCollected(status)) return

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
