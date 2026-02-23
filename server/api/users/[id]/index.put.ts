import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateUser, updateUserRoles, updateUserVerified } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  email: z.email().optional(),
  password: passwordSchema.optional(),
  name: z.string().min(1, 'Name is required').optional(),
  verified: z.boolean().optional(),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional(),
})

/** PUT /api/users/:id — update a user. Admin/Manager or own profile. */
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

  // Check if user has permission to update this user
  await authorize(event, updateUser, user)

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check if user is trying to update roles without permission
  if (body.roles !== undefined && !(await allows(event, updateUserRoles))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can update user roles' })
  }

  // Check if user is trying to update verified status without permission
  if (body.verified !== undefined && !(await allows(event, updateUserVerified))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can update verified status' })
  }

  // Prepare update data
  const updateData: {
    email?: string
    password?: string
    name?: string
    verified?: boolean
  } = {}

  if (body.email !== undefined) {
    // Check if email is already taken by another user
    const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, body.email)).get()
    if (existingUser && existingUser.id !== userId) {
      throw createError({ statusCode: 400, statusMessage: 'Email is already taken' })
    }
    updateData.email = body.email
  }

  if (body.password !== undefined) {
    updateData.password = await hashPassword(body.password)
  }

  if (body.name !== undefined) {
    updateData.name = body.name
  }

  if (body.verified !== undefined) {
    updateData.verified = body.verified
  }

  // Update user if there are changes
  if (Object.keys(updateData).length > 0) {
    await db.update(schema.users)
      .set(updateData)
      .where(eq(schema.users.id, userId))
  }

  // Update roles if provided
  if (body.roles !== undefined) {
    // Delete existing roles
    await db.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId))

    // Insert new roles
    if (body.roles.length > 0) {
      await db.insert(schema.userRoles).values(
        body.roles.map(role => ({
          userId,
          role,
        })),
      )
    }
  }

  // Get updated user with roles using query API
  const updatedUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    ...userWithRolesQuery,
  })

  if (!updatedUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve updated user' })
  }

  const result = formatUserResponse(updatedUser)

  // Update session if user is updating their own profile
  const { user: currentUser } = await getUserSession(event)
  if (currentUser && currentUser.id === userId) {
    await replaceUserSession(event, {
      user: result,
      loggedInAt: new Date(),
    })
  }

  return result
})
