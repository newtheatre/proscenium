import { randomBytes } from 'crypto'
import { emailVerifications } from 'hub:db:schema'

/**
 * Generate a secure verification token
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generate and set email verification token for a user
 * Returns the generated token
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const verificationToken = generateVerificationToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await db.insert(emailVerifications).values({
    userId,
    token: verificationToken,
    expiresAt,
  })

  return verificationToken
}

/**
 * Send verification email
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  // TODO: Implement an email service
  console.log(`Email verification for ${email} with token: ${token}`)
  console.log(`Verification URL: ${process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`)

  // For now, just log to console. Replace with actual email sending logic
  // Example with Resend:
  // await resend.emails.send({
  //   from: 'noreply@newtheatre.org.uk',
  //   to: email,
  //   subject: 'Verify your email address',
  //   html: `<a href="${process.env.NUXT_PUBLIC_BASE_URL}/verify-email?token=${token}">Click here to verify your email</a>`
  // })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // TODO: Implement an email service
  console.log(`Password reset for ${email} with token: ${token}`)
  console.log(`Reset URL: ${process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/password-reset?token=${token}`)

  // For now, just log to console. Replace with actual email sending logic
  // Example with Resend:
  // await resend.emails.send({
  //   from: 'noreply@newtheatre.org.uk',
  //   to: email,
  //   subject: 'Reset your password',
  //   html: `<a href="${process.env.NUXT_PUBLIC_BASE_URL}/password-reset?token=${token}">Click here to reset your password</a>`
  // })
}
