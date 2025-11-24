import prisma from '~~/server/database'
import type { RoleType, MembershipType } from '~~/prisma/generated/client'

/**
 * POST /api/v1/admin/seed-dev-users
 *
 * Development-only endpoint to create default user accounts for testing.
 *
 * Safety Checks:
 * - Only runs in development mode (NODE_ENV !== 'production')
 * - Only runs if no admin users exist in the database
 * - Creates users with default passwords for development testing
 *
 * Creates:
 * - 1 Admin user (admin@newtheatre.org.uk)
 * - 1 Manager user (manager@newtheatre.org.uk)
 * - 1 Trainer user (trainer@newtheatre.org.uk)
 * - 1 Regular user with no special roles (user@newtheatre.org.uk)
 *
 * All users are created with:
 * - Password: "DevPassword123!" (meets validation requirements)
 * - Email verified
 * - Setup completed
 * - Basic profile information
 */
export default defineEventHandler(async (_event) => {
  try {
    // Only allow in development
    const isDevelopment = process.env.NODE_ENV !== 'production'
    if (!isDevelopment) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This endpoint is only available in development mode',
      })
    }

    // Only allow if no admin users exist
    const existingAdmins = await prisma.userRole.count({
      where: { role: 'ADMIN' },
    })

    if (existingAdmins > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Admin users already exist. This seed script can only run on an empty system.',
      })
    }

    // Hash the default development password
    const defaultPassword = await hashPassword('DevPassword123!')

    // Define users to create
    const usersToCreate = [
      {
        email: 'admin@newtheatre.org.uk',
        password: defaultPassword,
        roles: ['ADMIN', 'MANAGER', 'TRAINER'] as RoleType[],
        profile: {
          name: 'Dev Admin',
          bio: 'Development admin account',
          course: 'Computer Science',
        },
        membership: { type: 'FULL' as MembershipType },
      },
      {
        email: 'manager@newtheatre.org.uk',
        password: defaultPassword,
        roles: ['MANAGER'] as RoleType[],
        profile: {
          name: 'Dev Manager',
          bio: 'Development manager account',
          course: 'Theatre Studies',
        },
        membership: { type: 'FULL' as MembershipType },
      },
      {
        email: 'trainer@newtheatre.org.uk',
        password: defaultPassword,
        roles: ['TRAINER'] as RoleType[],
        profile: {
          name: 'Dev Trainer',
          bio: 'Development trainer account',
          course: 'Drama',
        },
        membership: { type: 'ASSOCIATE' as MembershipType },
      },
      {
        email: 'user@newtheatre.org.uk',
        password: defaultPassword,
        roles: [] as RoleType[],
        profile: {
          name: 'Dev User',
          bio: 'Development regular user account',
          course: 'English Literature',
        },
        membership: { type: 'ASSOCIATE' as MembershipType },
      },
    ]

    const createdUsers = []

    // Create each user with their associated data
    for (const userData of usersToCreate) {
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: userData.password,
          emailVerified: true,
          setupCompleted: true,
          setupCompletedAt: new Date(),
          profile: {
            create: userData.profile,
          },
          membership: {
            create: userData.membership,
          },
          roles: {
            create: userData.roles.map(role => ({
              role,
            })),
          },
        },
        include: {
          profile: true,
          membership: true,
          roles: true,
        },
      })

      createdUsers.push({
        id: user.id,
        email: user.email,
        roles: user.roles.map(r => r.role),
        profile: user.profile
          ? {
              name: user.profile.name,
              course: user.profile.course,
            }
          : null,
        membershipType: user.membership?.type,
      })
    }

    return successResponse(
      { users: createdUsers },
      `Successfully created ${createdUsers.length} development users`,
    )
  }
  catch (error) {
    return handleApiError(error, 'Seed development users')
  }
})
