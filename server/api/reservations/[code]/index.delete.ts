/**
 * DELETE /api/reservations/[code]
 *
 * Cancels a reservation by its public code. Allows customers to cancel
 * their own reservations before collection. Sets status to CANCELLED_BY_CUSTOMER.
 *
 * Route Parameters:
 * @param {string} code - Public reservation code
 *
 * Request Body:
 * @param {string} [reason] - Optional cancellation reason
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     reservation: {
 *       id: string,
 *       reservationCode: string,
 *       status: ReservationStatus,
 *       cancelledAt: string
 *     }
 *   }
 * }
 *
 * Restrictions:
 * - Only PENDING_COLLECTION reservations can be cancelled
 * - Cancellation may have time restrictions (e.g., not within 2 hours of performance)
 * - Rate limited to prevent abuse (I'm pretty certain cloudflare deals with this for us)
 *
 * Process:
 * 1. Validates reservation code and current status
 * 2. Checks cancellation policy and time restrictions
 * 3. Updates reservation status to CANCELLED_BY_CUSTOMER
 * 4. Releases ticket inventory back to available pool
 * 5. Sends cancellation confirmation email
 * 6. Returns cancellation confirmation
 *
 * Error Responses:
 * - 400: Invalid reservation code
 * - 404: Reservation not found
 * - 409: Reservation cannot be cancelled (wrong status or too late)
 * - 429: Too many cancellation requests
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
