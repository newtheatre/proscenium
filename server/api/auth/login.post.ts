import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)

  // Find user by email
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Check if user has a password set
  if (!user.password) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Verify password
  const isValidPassword = await verifyPassword(user.password, password)

  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Get user roles
  const roles = await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, user.id)).all()

  // Update last login
  await db.update(schema.users)
    .set({ lastLogin: new Date().toISOString() })
    .where(eq(schema.users.id, user.id))

  // Set user session
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      roles: roles.map(r => r.role),
    },
    loggedInAt: new Date(),
  })

  return { message: 'Login successful' }
})
