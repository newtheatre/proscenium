import { z } from 'zod'
import { defaultPasswordPolicy, normaliseEmail, passwordProblem } from '../../../shared/auth'
import type { PasswordProblem } from '../../../shared/auth'

const body = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(4096),
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
