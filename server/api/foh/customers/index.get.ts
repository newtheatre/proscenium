/**
 * GET /api/foh/customers
 *
 * Retrieves a list of customers for FOH staff with search and filter options.
 * Includes both registered users and guest customers from reservations.
 * Requires FOH staff authentication.
 *
 * Query Parameters:
 * @param {string} [search] - Search term to filter by name or email
 * @param {boolean} [registeredOnly=false] - Only show customers with accounts
 * @param {string} [sortBy='name'] - Sort by 'name', 'email', 'lastReservation'
 * @param {string} [sortOrder='asc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=20] - Number of customers to return (max 100)
 * @param {number} [offset=0] - Number of customers to skip for pagination
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     customers: Customer[],
 *     total: number,
 *     limit: number,
 *     offset: number
 *   }
 * }
 *
 * Customer Object:
 * {
 *   id: string | null, // null for guest customers
 *   name: string,
 *   email: string,
 *   phone: string | null,
 *   isRegistered: boolean,
 *   totalReservations: number,
 *   lastReservationDate: string | null,
 *   profile?: Profile | null // Only for registered users
 * }
 *
 * Process:
 * 1. Authenticates FOH staff member
 * 2. Constructs query with search and filter parameters
 * 3. Aggregates data from Users and Reservations tables
 * 4. Merges registered and guest customer data
 * 5. Applies sorting and pagination
 * 6. Returns customer list
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
