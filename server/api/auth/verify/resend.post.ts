import { z } from 'zod'
import { normaliseEmail } from '#shared/utils/auth'

const body = z.object({ email: z.string().email().max(320) })

// Ask for a fresh verification message.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const account = await findByEmail(normaliseEmail(input.email))

  // Enumeration-safe: the same answer whether or not the address has an account, and whether
  // or not it was already verified.
  if (account && !account.verified) {
    await sendVerification(event, account.id)
  }

  return { ok: true, message: 'If that address needs confirming, a new link is on its way' }
})
