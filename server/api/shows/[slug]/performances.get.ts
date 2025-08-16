/**
 * GET /api/shows/[slug]/performances
 *
 * Retrieves all performances for a specific show with ticket availability information.
 *
 * Route Parameters:
 * @param {string} slug - URL-friendly show identifier
 *
 * Query Parameters:
 * @param {boolean} [includeAvailability=true] - Include ticket availability counts
 * @param {boolean} [upcomingOnly=true] - Only include upcoming performances
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     performances: Performance[]
 *   }
 * }
 *
 * Performance Object:
 * {
 *   id: string,
 *   showId: string,
 *   venueId: string,
 *   performanceDateTime: string,
 *   doorOpenTime: string | null,
 *   description: string | null,
 *   isActive: boolean,
 *   createdAt: string,
 *   updatedAt: string,
 *   venue: Venue,
 *   ticketTypes: TicketType[],
 *   availability?: {
 *     totalCapacity: number,
 *     availableTickets: number,
 *     reservedCount: number
 *   }
 * }
 *
 * Process:
 * 1. Validates show slug and retrieves show
 * 2. Fetches performances with venue and ticket type relations
 * 3. Calculates availability if requested
 * 4. Returns performance data
 *
 * Error Responses:
 * - 400: Invalid slug format
 * - 404: Show not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
