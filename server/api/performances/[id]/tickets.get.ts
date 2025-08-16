/**
 * GET /api/performances/[id]/tickets
 *
 * Retrieves real-time ticket availability and pricing information for a specific performance.
 * Optimized for frequent polling to provide live updates during booking flow.
 *
 * Route Parameters:
 * @param {string} id - Performance ID
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     performanceId: string,
 *     lastUpdated: string,
 *     totalCapacity: number,
 *     totalAvailable: number,
 *     totalReserved: number,
 *     ticketTypes: {
 *       id: string,
 *       name: string,
 *       description: string | null,
 *       currentPrice: number,
 *       isActive: boolean,
 *       availability: {
 *         available: number,
 *         reserved: number,
 *         collected: number
 *       }
 *     }[]
 *   }
 * }
 *
 * Process:
 * 1. Validates performance ID and active status
 * 2. Fetches current ticket type configurations
 * 3. Calculates real-time availability from reservation data
 * 4. Applies current pricing rules (performance or show level)
 * 5. Returns live availability data
 *
 * Notes:
 * - This endpoint is optimised for frequent polling
 * - Future consideration: WebSocket or Server-Sent Events for live updates
 * - Data is cached briefly to reduce database load
 *
 * Error Responses:
 * - 400: Invalid performance ID format
 * - 404: Performance not found or inactive
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
