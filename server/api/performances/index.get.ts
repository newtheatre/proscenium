/**
 * GET /api/performances
 *
 * Retrieves a list of upcoming published performances with optional filtering and pagination.
 *
 * Query Parameters:
 * @param {string} [venueId] - Filter by venue ID
 * @param {string} [showId] - Filter by show ID
 * @param {string} [from] - Filter performances from this date (ISO string)
 * @param {string} [to] - Filter performances up to this date (ISO string)
 * @param {number} [limit=10] - Number of performances to return (max 50)
 * @param {number} [offset=0] - Number of performances to skip for pagination
 * @param {boolean} [includeAvailability=false] - Include ticket availability information
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
 *   show: {
 *     id: string,
 *     title: string,
 *     slug: string,
 *     posterImageUrl: string | null,
 *     ageRating: string | null
 *   },
 *   venue: {
 *     id: string,
 *     name: string,
 *     capacity: number
 *   },
 *   availability?: {
 *     totalCapacity: number,
 *     availableTickets: number,
 *     reservedCount: number
 *   }
 * }
 *
 * Process:
 * 1. Validates query parameters
 * 2. Constructs database query with filters
 * 3. Fetches performances with show and venue relations
 * 4. Calculates availability if requested
 * 5. Returns paginated results
 *
 * Error Responses:
 * - 400: Invalid query parameters
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
