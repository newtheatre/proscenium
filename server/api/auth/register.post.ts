import { z } from 'zod'
import { ABSOLUTE_PASSWORD_LIMIT, defaultPasswordPolicy, normaliseEmail, passwordProblem } from '#shared/auth'
import type { PasswordProblem } from '#shared/auth'

// The schema guards shape and the outer limit; the length policy lives in passwordProblem so
// there is one place to change it and no second copy to drift (0012).
const body = z.object({
  // 320 is the longest address RFC 5321 permits: 64 local, an @, 255 domain.
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
})

// The message quotes the rule that refused it, so a person is not left guessing which one moved.
function explain({ reason, policy }: PasswordProblem): string {
  switch (reason) {
    case 'workspace-address': return 'A Workspace address signs in with Google and cannot hold a password'
    case 'too-short': return `A password must be at least ${policy.minLength} characters`
    case 'too-long': return `A password must be at most ${policy.maxLength} characters`
    case 'needs-mixed-case': return 'A password must use upper and lower case'
    case 'needs-number': return 'A password must contain a number'
    case 'needs-symbol': return 'A password must contain a symbol'
  }
}

// Register with an address and a password.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  const problem = passwordProblem(email, input.password, defaultPasswordPolicy())
  if (problem) throw createError({ statusCode: 400, statusMessage: explain(problem) })

  // Enumeration safety: an address already registered gets the same answer as a new one, and
  // learns it is taken through the email it would already be able to read.
  const existing = await findByEmail(email)
  if (!existing) {
    await createAccount({ email, name: input.name, passwordHash: await hashPassword(input.password) })
  }

  return { ok: true, message: 'Check your email to finish setting up your account' }
})
