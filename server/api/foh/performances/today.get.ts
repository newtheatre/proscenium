/**
 * GET /api/foh/performances/today
 *
 * Retrieves all performances scheduled for today with reservation summaries
 * for Front of House staff. Requires FOH staff authentication.
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     date: string, // Today's date in ISO format
 *     performances: Performance[]
 *   }
 * }
 *
 * Performance Object:
 * {
 *   id: string,
 *   performanceDateTime: string,
 *   doorOpenTime: string | null,
 *   details: string | null,
 *   show: {
 *     id: string,
 *     title: string,
 *     description: string | null,
 *     posterImageUrl: string | null,
 *     ageRating: string | null
 *   },
 *   venue: {
 *     id: string,
 *     name: string,
 *     capacity: number
 *   },
 *   reservationSummary: {
 *     totalReservations: number,
 *     pendingCollection: number,
 *     collected: number,
 *     cancelled: number,
 *     totalRevenue: number,
 *     expectedRevenue: number
 *   }
 * }
 *
 * Process:
 * 1. Authenticates FOH staff member
 * 2. Determines today's date in venue timezone
 * 3. Fetches all performances for today
 * 4. Aggregates reservation statistics for each performance
 * 5. Returns today's schedule with reservation summaries
 *
 * Error Responses:
 * - 401: Authentication required
 * - 403: Insufficient permissions (FOH access required)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
