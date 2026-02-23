import { randomBytes } from 'crypto'
import { schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/** Token expiry durations in milliseconds. */
export const TOKEN_EXPIRY = {
  /** Email verification tokens are valid for 24 hours. */
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  /** Password reset tokens are valid for 1 hour. */
  PASSWORD_RESET: 1 * 60 * 60 * 1000,
  /** Admin-initiated password reset tokens are valid for 24 hours. */
  ADMIN_PASSWORD_RESET: 24 * 60 * 60 * 1000,
} as const

/**
 * Generate a cryptographically secure random token.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Create and persist an email verification token for a user.
 *
 * @returns The generated token string.
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const token = generateVerificationToken()
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY.EMAIL_VERIFICATION)

  await db.insert(schema.emailVerifications).values({
    userId,
    token,
    expiresAt,
  })

  return token
}

/**
 * Create and persist a password reset token for a user.
 * Deletes any existing reset tokens for the user first.
 *
 * @param userId  The user to create a reset token for.
 * @param expiry  Token lifetime in ms (defaults to PASSWORD_RESET — 1 hour).
 * @returns The generated token string.
 */
export async function createPasswordResetToken(
  userId: string,
  expiry: number = TOKEN_EXPIRY.PASSWORD_RESET,
): Promise<string> {
  const token = generateVerificationToken()
  const expiresAt = new Date(Date.now() + expiry)

  // Remove any previous reset tokens for this user
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, userId))

  await db.insert(schema.passwordResets).values({
    userId,
    token,
    expiresAt,
  })

  return token
}
