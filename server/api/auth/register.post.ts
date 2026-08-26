import { z } from 'zod'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normaliseEmail, passwordProblem } from '../../../shared/auth'

const body = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
})

const PROBLEMS = {
  'workspace-address': 'A Workspace address signs in with Google and cannot hold a password',
  'too-short': `A password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  'too-long': 'That password is too long',
} as const

// Register with an address and a password.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  const problem = passwordProblem(email, input.password)
  if (problem) throw createError({ statusCode: 400, statusMessage: PROBLEMS[problem.reason] })

  // Enumeration safety: an address already registered gets the same answer as a new one, and
  // learns it is taken through the email it would already be able to read.
  const existing = await findByEmail(email)
  if (!existing) {
    await createAccount({ email, name: input.name, passwordHash: await hashPassword(input.password) })
  }

  return { ok: true, message: 'Check your email to finish setting up your account' }
})
