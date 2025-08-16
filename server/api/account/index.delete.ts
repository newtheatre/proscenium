/**
 * DELETE /api/account
 *
 * Deactivates the current user's account and schedules data deletion.
 * Requires user authentication and password confirmation.
 *
 * Request Body:
 * @param {string} password - User's current password for confirmation
 * @param {string} [reason] - Optional reason for account deletion
 * @param {boolean} [deleteData=false] - Whether to permanently delete all data
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     message: string,
 *     deactivatedAt: string,
 *     dataRetentionDays: number // Days before permanent deletion
 *   }
 * }
 *
 * Process:
 * 1. Authenticates user
 * 2. Validates password confirmation
 * 3. Checks for active reservations or commitments
 * 4. Deactivates account (sets isActive to false)
 * 5. Anonymizes or schedules deletion of personal data
 * 6. Maintains reservation history for show records
 * 7. Clears user session
 * 8. Sends account deactivation confirmation email (to user and archivist)
 *
 * Data Handling:
 * - Personal information is anonymized immediately
 * - Reservation history is maintained for audit purposes
 * - Complete data deletion occurs after retention period
 * - User can reactivate within retention period
 *
 * Restrictions:
 * - Cannot delete account with pending reservations
 * - Cannot delete account with outstanding obligations
 *
 * Error Responses:
 * - 400: Invalid password or active reservations exist
 * - 401: Authentication required
 * - 409: Account has pending reservations or obligations
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  return 'Hello Nitro'
})
