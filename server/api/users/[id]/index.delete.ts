import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { deleteUser } from '~~/shared/utils/abilities'

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

  // Delete user (cascade will delete related records)
  await db.delete(schema.users).where(eq(schema.users.id, userId))

  return { message: 'User deleted successfully' }
})
