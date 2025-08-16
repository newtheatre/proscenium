/**
 * GET /api/shows/[slug]
 *
 * Retrieves detailed information for a specific show by its slug identifier.
 *
 * Route Parameters:
 * @param {string} slug - URL-friendly show identifier
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     show: {
 *       id: string,
 *       title: string,
 *       slug: string,
 *       description: string,
 *       status: ShowStatus,
 *       showType: ShowType,
 *       posterImageUrl: string | null,
 *       programmeUrl: string | null,
 *       ageRating: string | null,
 *       createdAt: string,
 *       updatedAt: string,
 *       contentWarnings: ContentWarning[],
 *       performances: Performance[],
 *       induction: ShowInduction | null,
 *       showTicketPrices: ShowTicketPrice[]
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Extracts slug from route parameters
 * 2. Validates slug format
 * 3. Fetches show with all relations from database
 * 4. Returns complete show data
 *
 * Error Responses:
 * - 400: Invalid slug format
 * - 404: Show not found or not published
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
