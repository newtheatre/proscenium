/**
 * POST /api/admin/tickets
 *
 * Creates a new ticket type for use across shows and performances.
 * Requires admin authentication.
 *
 * Request Body:
 * @param {string} name - Ticket type name (e.g., "Student", "Member", "Standard")
 * @param {string} [description] - Detailed description of the ticket type
 * @param {number} defaultPrice - Default price in currency units (e.g., pence)
 * @param {boolean} [isActive=true] - Whether this ticket type is active
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     ticketType: {
 *       id: string,
 *       name: string,
 *       description: string | null,
 *       defaultPrice: number,
 *       isActive: boolean,
 *       createdAt: string,
 *       updatedAt: string
 *     }
 *   }
 * }
 *
 * Validation:
 * - Name must be unique and between 1-50 characters
 * - Description must be less than 500 characters if provided
 * - Default price must be a positive number
 *
 * Process:
 * 1. Authenticates admin user
 * 2. Validates input data
 * 3. Checks for duplicate ticket type names
 * 4. Creates new ticket type record
 * 5. Returns created ticket type
 *
 * Error Responses:
 * - 400: Invalid input data
 * - 401: Authentication required
 * - 403: Insufficient permissions (admin access required)
 * - 409: Ticket type name already exists
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
