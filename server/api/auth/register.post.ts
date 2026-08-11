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

  // A password-less shadow account (created by a guest booking or walk-in) may
  // already exist for this email — registering should claim it so the booking
  // history carries over. Only a real, password-set account blocks registration.
  const existingUser = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (existingUser?.password) {
    throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
  }

  // Addresses at RFC-reserved TLDs can never receive mail, so no registration
  // against one can be legitimate — but the import created thousands of them
  // (`door-sales@legacy.invalid`, and one per anonymised booker). Claiming one
  // would hand over that account's booking history.
  if (/\.(invalid|test|example|localhost)$/i.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'That email address cannot be used' })
  }

  if (existingUser) {
    // A password-less row is only claimable if it is genuinely an unclaimed
    // customer shadow account.
    //
    // Not claimable:
    //  - anything holding a role. The import created password-less accounts
    //    carrying ADMIN/MANAGER/BOX_OFFICE, which made `register` an
    //    unauthenticated route to full administrative access.
    //  - anything anonymised under the retention policy. The person is
    //    deliberately no longer identifiable, so nobody can prove they own it,
    //    and claiming it would undo the anonymisation.
    if (existingUser.anonymisedAt) {
      throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
    }

    const privileged = await db
      .select({ role: schema.userRoles.role })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, existingUser.id))
      .get()

    if (privileged) {
      throw createError({ statusCode: 400, statusMessage: 'User with this email already exists' })
    }
  }

  // Hash the password
  const hashedPassword = await hashPassword(password)

  const [newUser] = existingUser
    ? await db.update(schema.users)
        .set({ password: hashedPassword, name })
        .where(eq(schema.users.id, existingUser.id))
        .returning()
    : await db.insert(schema.users).values({
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
      sessionEpoch: newUser.sessionEpoch,
    },
    loggedInAt: new Date(),
  })

  return { message: 'User registered successfully' }
})
