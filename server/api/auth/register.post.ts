import { users } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createEmailVerificationToken, sendVerificationEmail } from '~~/server/utils/auth'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
    .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
    .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' }),
  name: z.string().min(1, 'Name is required'),
})

export default defineEventHandler(async (event) => {
  const { email, password, name } = await readValidatedBody(event, bodySchema.parse)

  // Check if user already exists
  const existingUser = await db.select().from(users).where(eq(users.email, email)).get()

  if (existingUser) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Hash the password
  const hashedPassword = await hashPassword(password)

  // Insert the new user into the database with no roles by default
  const [newUser] = await db.insert(users).values({
    email,
    password: hashedPassword,
    name,
    verified: false,
  }).returning()

  if (!newUser) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create user' })
  }

  // Generate and send email verification token
  const verificationToken = await createEmailVerificationToken(newUser.id)
  await sendVerificationEmail(email, verificationToken)

  // Set the user session
  await setUserSession(event, {
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      verified: newUser.verified,
      roles: [],
    },
    loggedInAt: new Date(),
  })

  return { message: 'User registered successfully' }
})
