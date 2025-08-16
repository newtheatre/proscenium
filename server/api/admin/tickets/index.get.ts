/**
 * GET /api/admin/tickets
 *
 * Retrieves all ticket types with pagination, sorting, and filtering options
 * for admin management. Requires admin authentication.
 *
 * Query Parameters:
 * @param {string} [search] - Search by ticket type name or description
 * @param {boolean} [isActive] - Filter by active status (true/false)
 * @param {string} [sortBy='name'] - Sort by field (name, defaultPrice, createdAt)
 * @param {string} [sortOrder='asc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=25] - Number of ticket types to return (max 100)
 * @param {number} [offset=0] - Number of ticket types to skip for pagination
 * @param {boolean} [includeUsageStats=false] - Include usage statistics
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     ticketTypes: TicketType[],
 *     total: number,
 *     limit: number,
 *     offset: number
 *   }
 * }
 *
 * TicketType Object:
 * {
 *   id: string,
 *   name: string,
 *   description: string | null,
 *   defaultPrice: number,
 *   isActive: boolean,
 *   createdAt: string,
 *   updatedAt: string,
 *   usageStats?: {
 *     totalReservations: number,
 *     activeShows: number,
 *     totalRevenue: number
 *   }
 * }
 *
 * Process:
 * 1. Authenticates admin user
 * 2. Validates query parameters
 * 3. Constructs database query with filters and sorting
 * 4. Fetches ticket types
 * 5. Calculates usage statistics if requested
 * 6. Returns paginated ticket type list
 *
 * Error Responses:
 * - 400: Invalid query parameters
 * - 401: Authentication required
 * - 403: Insufficient permissions (admin access required)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
