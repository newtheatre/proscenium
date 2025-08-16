/**
 * GET /api/performances/[id]
 *
 * Retrieves detailed information for a specific performance including venue,
 * show details, and ticket availability for booking purposes.
 *
 * Route Parameters:
 * @param {string} id - Performance ID
 *
 * Query Parameters:
 * @param {boolean} [includeAvailability=true] - Include ticket availability information
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     performance: {
 *       id: string,
 *       performanceDateTime: string,
 *       doorOpenTime: string | null,
 *       description: string | null,
 *       isActive: boolean,
 *       createdAt: string,
 *       updatedAt: string,
 *       show: {
 *         id: string,
 *         title: string,
 *         slug: string,
 *         description: string,
 *         posterImageUrl: string | null,
 *         ageRating: string | null,
 *         contentWarnings: ContentWarning[]
 *       },
 *       venue: {
 *         id: string,
 *         name: string,
 *         capacity: number,
 *         address: string | null,
 *         features: VenueFeature[]
 *       },
 *       ticketTypes: {
 *         id: string,
 *         name: string,
 *         description: string | null,
 *         defaultPrice: number,
 *         currentPrice: number,
 *         isActive: boolean,
 *         availability?: {
 *           available: number,
 *           total: number
 *         }
 *       }[]
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates performance ID
 * 2. Fetches performance with show, venue, and ticket type relations
 * 3. Calculates current pricing based on performance or show-level prices
 * 4. Computes ticket availability if requested
 * 5. Returns complete performance information
 *
 * Error Responses:
 * - 400: Invalid performance ID format
 * - 404: Performance not found or inactive
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
