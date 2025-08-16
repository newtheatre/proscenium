/**
 * POST /api/admin/performances
 *
 * Creates a new performance for a show. Requires admin authentication.
 *
 * Request Body:
 * @param {string} showId - ID of the show this performance belongs to
 * @param {string} venueId - ID of the venue where performance takes place
 * @param {string} performanceDateTime - Performance date and time (ISO string)
 * @param {string} [details] - Performance-specific description or notes
 * @param {PerformanceTicketPriceInput[]} [ticketPrices] - Custom pricing for this performance
 *
 * PerformanceTicketPriceInput:
 * {
 *   ticketTypeId: string,
 *   price: number
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     performance: {
 *       id: string,
 *       showId: string,
 *       venueId: string,
 *       performanceDateTime: string,
 *       doorOpenTime: string | null,
 *       details: string | null,
 *       isActive: boolean,
 *       createdAt: string,
 *       updatedAt: string,
 *       show: Show,
 *       venue: Venue,
 *       performanceTicketPrices: PerformanceTicketPrice[]
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Authenticates admin user
 * 2. Validates input data and show/venue existence
 * 3. Checks for scheduling conflicts at the venue
 * 4. Creates performance record
 * 5. Creates custom ticket pricing if provided
 * 6. Returns complete performance data
 *
 * Validation:
 * - Show must exist and be active
 * - Venue must exist and be available
 * - Performance time must be in the future
 * - No overlapping performances at the same venue
 *
 * Error Responses:
 * - 400: Invalid input data or scheduling conflict
 * - 401: Authentication required
 * - 403: Insufficient permissions (admin access required)
 * - 404: Show or venue not found
 * - 409: Venue scheduling conflict
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
