import { db } from '@nuxthub/db'
import { listUsers } from '~~/shared/utils/abilities'

/** GET /api/users — list all users. Staff only. */
export default defineEventHandler(async (event) => {
  // Check if user has permission to read users
  await authorize(event, listUsers)

  // Get all users with their roles using query API
  const allUsers = await db.query.users.findMany(userWithRolesQuery)

  // Map to expected format
  return allUsers.map(formatUserResponse)
})
