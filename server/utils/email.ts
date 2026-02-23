/**
 * Email sending utilities.
 *
 * All email functions are currently placeholders that log to the console.
 * Replace the `sendEmail` implementation with a real provider (e.g. Resend,
 * Postmark, SES) when ready for production.
 */

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

/**
 * Send an email. Currently logs to the console as a placeholder.
 *
 * @example
 * ```ts
 * await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   html: '<p>Hello!</p>',
 * })
 * ```
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  // TODO: Replace with a real email provider (e.g. Resend, Postmark, SES)
  console.log(`[Email] To: ${to} | Subject: ${subject}`)
  console.log(`[Email] Body: ${html}`)
}

/**
 * Send an email verification link to the user.
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const { public: { baseUrl } } = useRuntimeConfig()
  const url = `${baseUrl}/verify-email?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Verify your email address',
    html: `<p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p>`,
  })
}

/**
 * Send a password reset link to the user.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const { public: { baseUrl } } = useRuntimeConfig()
  const url = `${baseUrl}/reset-password?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Reset your password',
    html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p>`,
  })
}
