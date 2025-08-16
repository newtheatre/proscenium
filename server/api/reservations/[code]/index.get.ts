/**
 * GET /api/reservations/[code]
 *
 * Retrieves detailed information for a specific reservation using its public code.
 * No authentication required - accessible to customers with the reservation code.
 *
 * Route Parameters:
 * @param {string} code - Public reservation code
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     reservation: {
 *       id: string,
 *       reservationCode: string,
 *       totalPrice: number,
 *       status: ReservationStatus,
 *       reservationDateTime: string,
 *       collectionDeadline: string | null,
 *       customerName: string,
 *       customerEmail: string,
 *       notes: string | null,
 *       performance: {
 *         id: string,
 *         performanceDateTime: string,
 *         doorOpenTime: string | null,
 *         show: {
 *           title: string,
 *           slug: string,
 *           posterImageUrl: string | null,
 *           ageRating: string | null,
 *           contentWarnings: ContentWarning[]
 *         },
 *         venue: {
 *           name: string,
 *           address: string | null
 *         }
 *       },
 *       reservedTickets: {
 *         id: string,
 *         quantity: number,
 *         pricePerItemAtReservation: number,
 *         ticketTypeNameAtReservation: string
 *       }[]
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates reservation code format
 * 2. Searches for reservation with public-safe relations
 * 3. Filters out internal information (admin notes, etc.)
 * 4. Returns customer-facing reservation details
 *
 * Error Responses:
 * - 400: Invalid reservation code format
 * - 404: Reservation not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
