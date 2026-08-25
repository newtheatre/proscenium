import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
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

  // Any reference at all, not a hand-listed few: `restrict` would surface a raw
  // foreign-key error and `set null` would quietly erase authorship (ADR-0014).
  const referencedBy = await tablesReferencingUser(userId)

  if (referencedBy.length) {
    throw createError({
      statusCode: 409,
      statusMessage: `This account cannot be deleted because records still reference it (${referencedBy.join(', ')}). Booking, sales and rota history has to be kept for reporting. Erase the person centrally at the auth service instead: that anonymises this mirror row and keeps the record.`,
    })
  }

  await db.delete(schema.users).where(eq(schema.users.id, userId))

  return { message: 'User deleted successfully' }
})
