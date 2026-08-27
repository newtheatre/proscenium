import { z } from 'zod'

// The schema guards shape and the outer limit; the length policy lives in passwordProblem so
// there is one place to change it and no second copy to drift (0012).
const body = z.object({
  // 320 is the longest address RFC 5321 permits: 64 local, an @, 255 domain.
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
})

// Register with an address and a password.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  const problem = passwordProblem(email, input.password, defaultPasswordPolicy())
  if (problem) throw createError({ statusCode: 400, statusMessage: explainPasswordProblem(problem) })

  // Enumeration safety: an address already registered gets the same answer as a new one, and
  // learns it is taken through the email it would already be able to read (A-101 criterion 2).
  const existing = await findByEmail(email)
  if (existing) {
    await notify(event, {
      type: 'account.exists',
      userId: existing.id,
      context: { name: '', signInUrl: `${useRuntimeConfig(event).public.baseURL}/sign-in` },
    })
  }
  else {
    const id = await createAccount({ email, name: input.name, passwordHash: await hashPassword(input.password) })
    await sendVerification(event, id)
  }

  return { ok: true, message: 'Check your email to finish setting up your account' }
})
