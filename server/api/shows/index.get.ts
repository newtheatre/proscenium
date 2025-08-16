/**
 * GET /api/shows
 *
 * Retrieves a list of published (active) shows with optional filtering and pagination.
 *
 * Query Parameters:
 * @param {string} [search] - Search term to filter shows by title or description
 * @param {ShowType} [type] - Filter by show type (IN_HOUSE, STUDIO, FESTIVAL, EXTERNAL_HIRE, WORKSHOP, OTHER)
 * @param {number} [limit=10] - Number of shows to return (max 50)
 * @param {number} [offset=0] - Number of shows to skip for pagination
 * @param {boolean} [includeUpcoming=true] - Include shows with upcoming performances
 * @param {boolean} [includePast=false] - Include shows with only past performances
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     shows: Show[],
 *     total: number,
 *     limit: number,
 *     offset: number
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
 *   programUrl: string | null,
 *   ageRating: string | null,
 *   createdAt: string,
 *   updatedAt: string,
 *   contentWarnings: ContentWarning[],
 *   performances: Performance[] // Only upcoming performances
 * }
 *
 * Process:
 * 1. Validates query parameters
 * 2. Constructs database query with filters
 * 3. Fetches published shows with relations
 * 4. Returns paginated results
 *
 * Error Responses:
 * - 400: Invalid query parameters
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
