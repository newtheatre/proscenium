import { z } from 'zod'
import { normaliseEmail } from '#shared/utils/auth'

const body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT).optional(),
})

// Close the account: leaving is one decision, not an architecture lesson (A-125).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  // A borrowed screen must not be able to do this (criterion 1).
  await requireFreshSession(event)
  const input = await readValidatedBodyOrThrow(event, body)

  if (normaliseEmail(input.email) !== account.email) {
    throw createError({ statusCode: 400, statusMessage: 'That is not the address on this account' })
  }

  // Where a password exists it is proved, so a session alone cannot close an account.
  if (account.password) {
    if (!input.password || !await verifyPassword(account.password, input.password)) {
      throw createError({ statusCode: 401, statusMessage: 'That password does not match' })
    }
  }

  const outcome = await eraseAccount(account.id, account.id)
  await clearUserSession(event)

  return { ok: true, ...outcome }
})
