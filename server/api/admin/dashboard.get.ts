import { requireRole } from '~~/server/utils/guards'

export default defineEventHandler(async (event) => {
  // Require ADMIN role for this endpoint
  const user = await requireRole(event, 'ADMIN')

  return {
    message: 'This is an admin-only endpoint',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles,
    },
    adminData: {
      totalUsers: 42,
      systemStatus: 'healthy',
    },
  }
})
