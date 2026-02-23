import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email(),
  password: passwordSchema,
  name: z.string().min(1, 'Name is required'),
})

/** POST /api/auth/register — register a new user account. */
export default defineEventHandler(async (event) => {
  const { email, password, name } = await readValidatedBody(event, bodySchema.parse)

  // Check if user already exists
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (existingUser) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Hash the password
  const hashedPassword = await hashPassword(password)

  // Insert the new user into the database with no roles by default
  const [newUser] = await db.insert(schema.users).values({
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
