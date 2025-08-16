/**
 * GET /api/foh/reservations
 *
 * Retrieves a list of reservations for FOH staff with search and filter options.
 * Requires FOH staff authentication.
 *
 * Query Parameters:
 * @param {string} [search] - Search by reservation code, customer name, or email
 * @param {ReservationStatus} [status] - Filter by reservation status
 * @param {string} [performanceId] - Filter by specific performance
 * @param {string} [date] - Filter by performance date (YYYY-MM-DD)
 * @param {string} [sortBy='reservationDateTime'] - Sort by field
 * @param {string} [sortOrder='desc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=25] - Number of reservations to return (max 100)
 * @param {number} [offset=0] - Number of reservations to skip for pagination
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     reservations: Reservation[],
 *     total: number,
 *     limit: number,
 *     offset: number,
 *     statusCounts: {
 *       [status: string]: number
 *     }
 *   }
 * }
 *
 * Reservation Object:
 * {
 *   id: string,
 *   reservationCode: string,
 *   totalPrice: number,
 *   status: ReservationStatus,
 *   reservationDateTime: string,
 *   collectionDeadline: string | null,
 *   customerName: string,
 *   customerEmail: string,
 *   customerPhone: string | null,
 *   notes: string | null,
 *   adminNotes: string | null,
 *   performance: {
 *     id: string,
 *     performanceDateTime: string,
 *     show: {
 *       title: string,
 *       slug: string
 *     },
 *     venue: {
 *       name: string
 *     }
 *   },
 *   reservedTickets: ReservedTicket[]
 * }
 *
 * Process:
 * 1. Authenticates FOH staff member
 * 2. Validates query parameters
 * 3. Constructs database query with filters
 * 4. Fetches reservations with related data
 * 5. Calculates status counts for filtering UI
 * 6. Returns paginated reservation list
 *
 * Error Responses:
 * - 400: Invalid query parameters
 * - 401: Authentication required
 * - 403: Insufficient permissions (FOH access required)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
