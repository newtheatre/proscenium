import { users, userRoles } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createUser, updateUserRoles, updateUserVerified } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
    .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
    .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' }),
  name: z.string().min(1, 'Name is required'),
  verified: z.boolean().optional().default(false),
  roles: z.array(z.enum(['ADMIN', 'MANAGER', 'BOX_OFFICE'])).optional().default([]),
})

export default defineEventHandler(async (event) => {
  // Check if user has permission to create users
  await authorize(event, createUser)

  const { email, password, name, verified, roles: userRolesToAssign } = await readValidatedBody(event, bodySchema.parse)

  // Check if user has permission to set verified status
  if (verified && !(await allows(event, updateUserVerified))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can set verified status' })
  }

  // Check if user has permission to assign roles
  if (userRolesToAssign.length > 0 && !(await allows(event, updateUserRoles))) {
    throw createError({ statusCode: 403, statusMessage: 'Only admins can assign roles' })
  }

  // Check if user already exists
  const existingUser = await db.select().from(users).where(eq(users.email, email)).get()

  if (existingUser) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Hash the password
  const hashedPassword = await hashPassword(password)

  // Insert the new user into the database
  const [newUser] = await db.insert(users).values({
    email,
    password: hashedPassword,
    name,
    verified,
  }).returning()

  if (!newUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
  }

  // Assign roles if provided
  if (userRolesToAssign.length > 0) {
    await db.insert(userRoles).values(
      userRolesToAssign.map(role => ({
        userId: newUser.id,
        role,
      })),
    )
  }

  // Get the created user with roles using query API
  const createdUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, newUser.id),
    columns: {
      password: false,
    },
    with: {
      userRoles: {
        columns: {
          role: true,
        },
      },
    },
  })

  if (!createdUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve created user' })
  }

  return {
    ...createdUser,
    roles: createdUser.userRoles.map(r => r.role),
    userRoles: undefined,
  }
})
