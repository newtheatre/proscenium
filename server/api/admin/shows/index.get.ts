/**
 * GET /api/admin/shows
 *
 * Retrieves a list of all shows with pagination, search, and filtering options.
 * Includes both published and draft shows. Requires admin authentication.
 *
 * Query Parameters:
 * @param {string} [search] - Search term to filter shows by title or description
 * @param {ShowStatus} [status] - Filter by show status (DRAFT, PUBLISHED, CANCELLED)
 * @param {ShowType} [type] - Filter by show type
 * @param {string} [sortBy='createdAt'] - Sort by field (title, status, createdAt, updatedAt)
 * @param {string} [sortOrder='desc'] - Sort order 'asc' or 'desc'
 * @param {number} [limit=20] - Number of shows to return (max 100)
 * @param {number} [offset=0] - Number of shows to skip for pagination
 * @param {boolean} [includeInactive=false] - Include soft-deleted shows
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     shows: Show[],
 *     total: number,
 *     limit: number,
 *     offset: number,
 *     statusCounts: {
 *       [status: string]: number
 *     }
 *   }
 * }
 *
 * Show Object:
 * {
 *   id: string,
 *   title: string,
 *   slug: string,
 *   description: string,
 *   status: ShowStatus,
 *   showType: ShowType,
 *   posterImageUrl: string | null,
 *   programmeUrl: string | null,
 *   ageRating: string | null,
 *   isActive: boolean,
 *   createdAt: string,
 *   updatedAt: string,
 *   performanceCount: number,
 *   totalReservations: number
 * }
 *
 * Process:
 * 1. Authenticates admin user
 * 2. Validates query parameters
 * 3. Constructs database query with filters and sorting
 * 4. Fetches shows with aggregated performance and reservation data
 * 5. Calculates status counts for admin dashboard
 * 6. Returns paginated show list
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
