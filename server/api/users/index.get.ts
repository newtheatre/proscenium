import { listUsers } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  // Check if user has permission to read users
  await authorize(event, listUsers)

  // Get all users with their roles using query API
  const allUsers = await db.query.users.findMany({
    columns: {
      password: false, // Exclude password from results
    },
    with: {
      userRoles: {
        columns: {
          role: true,
        },
      },
    },
  })

  // Map to expected format
  return allUsers.map(user => ({
    ...user,
    roles: user.userRoles.map(r => r.role),
    userRoles: undefined, // Remove the nested userRoles object
  }))
})
