/**
 * POST /api/reservations
 *
 * Creates a new ticket reservation for a performance. No authentication required for guest reservations.
 *
 * Request Body:
 * @param {string} performanceId - ID of the performance to reserve tickets for
 * @param {ReservedTicketInput[]} tickets - Array of ticket types and quantities to reserve
 * @param {string} customerName - Customer's full name
 * @param {string} customerEmail - Customer's email address
 * @param {string} [customerPhone] - Customer's phone number (optional)
 * @param {string} [notes] - Customer notes or special requests
 * @param {string} [userId] - User ID if authenticated (optional)
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
 *       performance: {
 *         id: string,
 *         performanceDateTime: string,
 *         venue: Venue,
 *         show: Show
 *       }
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates input data and performance availability
 * 2. Checks ticket availability for requested quantities
 * 3. Calculates total price based on current pricing
 * 4. Creates reservation with PENDING_COLLECTION status
 * 5. Sends confirmation email to customer
 * 6. Returns reservation details
 *
 * Error Responses:
 * - 400: Invalid input data or insufficient ticket availability
 * - 404: Performance or ticket types not found
 * - 409: Requested tickets no longer available
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
