import { db } from '@nuxthub/db'
import { listUsers } from '~~/shared/utils/abilities'

/** GET /api/users — list users, or look up one by ?email=. Staff only. */
export default defineEventHandler(async (event) => {
  // Check if user has permission to read users
  await authorize(event, listUsers)

  const { email } = getQuery(event)

  // When an email is supplied (e.g. the box-office walk-in lookup), return at
  // most the single matching user rather than downloading the whole table.
  if (typeof email === 'string' && email.length > 0) {
    const user = await db.query.users.findFirst({
      ...userWithRolesQuery,
      where: (u, { eq, sql }) => eq(sql`lower(${u.email})`, email.toLowerCase()),
    })
    return user ? [formatUserResponse(user)] : []
  }

  // Get all users with their roles using query API
  const allUsers = await db.query.users.findMany(userWithRolesQuery)

  // Map to expected format
  return allUsers.map(formatUserResponse)
})
