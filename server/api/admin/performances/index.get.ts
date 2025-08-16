/**
 * GET /api/admin/performances
 *
 * Retrieves a list of performances with pagination, search, and filtering options
 * for admin management. Includes detailed performance, show, and venue information.
 * Requires admin authentication.
 *
 * Query Parameters:
 * @param {string} [search] - Search by show title, venue name, or performance description
 * @param {string} [showId] - Filter by specific show ID
 * @param {string} [venueId] - Filter by specific venue ID
 * @param {string} [from] - Filter performances from this date (ISO string)
 * @param {string} [to] - Filter performances up to this date (ISO string)
 * @param {string} [sortBy='performanceDateTime'] - Sort by field
 * @param {string} [sortOrder='asc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=25] - Number of performances to return (max 100)
 * @param {number} [offset=0] - Number of performances to skip for pagination
 * @param {boolean} [includeInactive=false] - Include soft-deleted performances
 * @param {boolean} [includeStats=true] - Include reservation and revenue statistics
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     performances: Performance[],
 *     total: number,
 *     limit: number,
 *     offset: number
 *   }
 * }
 *
 * Performance Object:
 * {
 *   id: string,
 *   performanceDateTime: string,
 *   doorOpenTime: string | null,
 *   description: string | null,
 *   isActive: boolean,
 *   createdAt: string,
 *   updatedAt: string,
 *   show: {
 *     id: string,
 *     title: string,
 *     slug: string,
 *     status: ShowStatus
 *   },
 *   venue: {
 *     id: string,
 *     name: string,
 *     capacity: number
 *   },
 *   stats?: {
 *     totalReservations: number,
 *     pendingCollections: number,
 *     totalRevenue: number,
 *     capacityUtilization: number
 *   }
 * }
 *
 * Process:
 * 1. Authenticates admin user
 * 2. Validates query parameters
 * 3. Constructs database query with filters and sorting
 * 4. Fetches performances with show and venue relations
 * 5. Calculates statistics if requested
 * 6. Returns paginated performance list
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
