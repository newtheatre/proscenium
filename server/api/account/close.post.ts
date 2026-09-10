import { z } from 'zod'
import { normaliseEmail } from '#shared/utils/auth'

const body = z.object({
  email: z.string().email().max(320),
})

// Close the account: leaving is one decision, not an architecture lesson (A-125).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  // A borrowed screen must not be able to do this; identity is re-asserted in the modal, not in a
  // password field a Workspace account has none to fill (A-128 criteria 1, 3 and 4).
  await requireFreshSession(event)
  const input = await readValidatedBodyOrThrow(event, body)

  if (normaliseEmail(input.email) !== account.email) {
    throw createError({ statusCode: 400, statusMessage: 'That is not the address on this account' })
  }

  const outcome = await eraseAccount(account.id, account.id)
  await clearUserSession(event)

  return { ok: true, ...outcome }
})
