/**
 * POST /api/foh/reservations
 *
 * Creates a new reservation directly through FOH system. Defaults to PENDING_COLLECTION status.
 * Requires FOH staff authentication.
 *
 * Request Body:
 * @param {string} performanceId - ID of the performance to reserve tickets for
 * @param {ReservedTicketInput[]} tickets - Array of ticket types and quantities
 * @param {string} customerName - Customer's full name
 * @param {string} customerEmail - Customer's email address
 * @param {string} [customerPhone] - Customer's phone number (optional)
 * @param {string} [notes] - Customer notes or special requests
 * @param {string} [adminNotes] - Internal staff notes
 * @param {string} [userId] - Link to existing user account (optional)
 * @param {string} [collectionDeadline] - Custom collection deadline (ISO string)
 * @param {ReservationStatus} [status='PENDING_COLLECTION'] - Initial status
 *
 * ReservedTicketInput:
 * {
 *   ticketTypeId: string,
 *   quantity: number
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     reservation: {
 *       id: string,
 *       reservationCode: string,
 *       totalPrice: number,
 *       status: ReservationStatus,
 *       collectionDeadline: string | null,
 *       customerName: string,
 *       customerEmail: string,
 *       reservedTickets: ReservedTicket[],
 *       performance: Performance
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Authenticates FOH staff member
 * 2. Validates input data and performance availability
 * 3. Checks ticket availability for requested quantities
 * 4. Calculates total price with current pricing
 * 5. Creates reservation with specified or default status
 * 6. Optionally sends confirmation email
 * 7. Returns reservation details
 *
 * Error Responses:
 * - 400: Invalid input data or insufficient ticket availability
 * - 401: Authentication required
 * - 403: Insufficient permissions (FOH access required)
 * - 404: Performance or ticket types not found
 * - 409: Requested tickets no longer available
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
