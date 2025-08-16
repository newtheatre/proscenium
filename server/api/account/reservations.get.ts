/**
 * GET /api/account/reservations
 *
 * Retrieves all reservations for the authenticated user with filtering and pagination.
 * Requires user authentication.
 *
 * Query Parameters:
 * @param {ReservationStatus} [status] - Filter by reservation status
 * @param {string} [from] - Filter reservations from this date (ISO string)
 * @param {string} [to] - Filter reservations up to this date (ISO string)
 * @param {string} [sortBy='reservationDateTime'] - Sort by field
 * @param {string} [sortOrder='desc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=20] - Number of reservations to return (max 100)
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
 *   notes: string | null,
 *   performance: {
 *     id: string,
 *     performanceDateTime: string,
 *     doorOpenTime: string | null,
 *     show: {
 *       title: string,
 *       slug: string,
 *       posterImageUrl: string | null
 *     },
 *     venue: {
 *       name: string,
 *       address: string | null
 *     }
 *   },
 *   reservedTickets: ReservedTicket[]
 * }
 *
 * Process:
 * 1. Authenticates user
 * 2. Validates query parameters
 * 3. Constructs database query filtered by user ID
 * 4. Fetches user's reservations with performance and show details
 * 5. Calculates status counts for user interface
 * 6. Returns paginated reservation history
 *
 * Error Responses:
 * - 400: Invalid query parameters
 * - 401: Authentication required
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
