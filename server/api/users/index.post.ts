import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createUser, updateUserRoles, updateUserVerified } from '~~/shared/utils/abilities'
import { TOKEN_EXPIRY } from '~~/server/utils/auth'

const bodySchema = z.object({
  email: z.email(),
  name: z.string().min(1, 'Name is required'),
  verified: z.boolean().optional().default(false),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional().default([]),
})

/** POST /api/users — create a new user. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  await authorize(event, createUser)

  const { email, name, verified, roles: userRolesToAssign } = await readValidatedBody(event, bodySchema.parse)

  // Check granular permissions for verified status and roles
  if (verified && !(await allows(event, updateUserVerified))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can set verified status' })
  }
  if (userRolesToAssign.length > 0 && !(await allows(event, updateUserRoles))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can assign roles' })
  }

  // Ensure email is not already taken
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()
  if (existingUser) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Create the user (no password — they must set their own via the reset flow)
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

  // Fetch the created user with roles
  const createdUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, newUser.id),
    ...userWithRolesQuery,
  })

  if (!createdUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve created user' })
  }

  // Send password reset email so the user can set their own password
  const token = await createPasswordResetToken(newUser.id, TOKEN_EXPIRY.ADMIN_PASSWORD_RESET)
  await sendPasswordResetEmail(email, token)

  return formatUserResponse(createdUser)
})
