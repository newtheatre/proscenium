import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { deleteUser } from '~~/shared/utils/abilities'

/** DELETE /api/users/:id. Delete a user. Admin or own account. */
export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  // Get the user
  const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Check if user has permission to delete this user
  await authorize(event, deleteUser, { id: userId })

  // reservations.userId is `restrict`, so anyone with booking history cannot be
  // deleted. The answer there is anonymisation (ADR-0014).
  const [bookings] = await db
    .select({ n: count() })
    .from(schema.reservations)
    .where(eq(schema.reservations.userId, userId))

  if ((bookings?.n ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `This account cannot be deleted because it has ${bookings!.n} booking${bookings!.n === 1 ? '' : 's'} against it. Booking history has to be kept for reporting. Close the account instead, POST /api/users/${userId}/anonymise removes the person and keeps the sales record.`,
    })
  }

  await db.delete(schema.users).where(eq(schema.users.id, userId))

  return { message: 'User deleted successfully' }
})
