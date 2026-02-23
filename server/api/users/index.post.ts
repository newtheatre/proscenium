import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createUser, updateUserRoles, updateUserVerified } from '~~/shared/utils/abilities'
import { generateVerificationToken, sendPasswordResetEmail } from '~~/server/utils/auth'

const bodySchema = z.object({
  email: z.email(),
  name: z.string().min(1, 'Name is required'),
  verified: z.boolean().optional().default(false),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional().default([]),
})

export default defineEventHandler(async (event) => {
  // Check if user has permission to create users
  await authorize(event, createUser)

  const { email, name, verified, roles: userRolesToAssign } = await readValidatedBody(event, bodySchema.parse)

  // Check if user has permission to set verified status
  if (verified && !(await allows(event, updateUserVerified))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can set verified status' })
  }

  // Check if user has permission to assign roles
  if (userRolesToAssign.length > 0 && !(await allows(event, updateUserRoles))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can assign roles' })
  }

  // Check if user already exists
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (existingUser) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Insert the new user into the database (no password - user must set their own)
  const [newUser] = await db.insert(schema.users).values({
    email,
    name,
    verified,
  }).returning()

  if (!newUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
  }

  // Assign roles if provided
  if (userRolesToAssign.length > 0) {
    await db.insert(schema.userRoles).values(
      userRolesToAssign.map(role => ({
        userId: newUser.id,
        role,
      })),
    )
  }

  // Get the created user with roles using query API
  const createdUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, newUser.id),
    ...userWithRolesQuery,
  })

  if (!createdUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve created user' })
  }

  // Send password reset email so the user can set their own password
  const resetToken = generateVerificationToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.insert(schema.passwordResets).values({
    userId: newUser.id,
    token: resetToken,
    expiresAt,
  })

  await sendPasswordResetEmail(email, resetToken)

  return formatUserResponse(createdUser)
})
