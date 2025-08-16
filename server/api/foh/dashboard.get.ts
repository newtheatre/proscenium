/**
 * GET /api/foh/dashboard
 *
 * Retrieves dashboard information for Front of House (FOH) staff for today's overview.
 * Requires FOH staff authentication.
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     todaysPerformances: Performance[],
 *     totalReservations: number,
 *     pendingCollections: number,
 *     totalRevenue: number,
 *     venueCapacityUtilization: {
 *       [venueId: string]: {
 *         venueName: string,
 *         totalCapacity: number,
 *         reservedTickets: number,
 *         utilizationPercentage: number
 *       }
 *     },
 *     recentActivity: RecentActivity[]
 *   }
 * }
 *
 * RecentActivity:
 * {
 *   id: string,
 *   type: 'reservation_created' | 'tickets_collected' | 'reservation_cancelled',
 *   timestamp: string,
 *   details: string,
 *   reservationCode?: string
 * }
 *
 * Process:
 * 1. Authenticates FOH staff member
 * 2. Fetches today's performances and related data
 * 3. Calculates reservation statistics
 * 4. Computes venue capacity utilization
 * 5. Retrieves recent reservation activity
 * 6. Returns dashboard data
 *
 * Error Responses:
 * - 401: Authentication required
 * - 403: Insufficient permissions (FOH access required)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
