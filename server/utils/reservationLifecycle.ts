/**
 * When a reservation's tickets may be changed, and when money may be given
 * back. Nothing is paid until the tickets are collected (ADR-0011):
 *
 * - `PENDING` — edit the composition freely (`PUT .../tickets`).
 * - `COLLECTED`, `DOOR` — refund only (`POST .../refund`).
 * - `CANCELLED`, `NO_SHOW` — terminal for both.
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
