import { z } from 'zod'
import { normaliseEmail } from '#shared/utils/auth'

const body = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(200).optional(),
})

// Resolve an address to an account, minting the claimable guest A-116 describes when there is none.
// A trainer holds this because a record cannot be attached to somebody who is not here yet (G-117).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  const held = await findByEmail(email)
  if (held) {
    // An erased account is a tombstone. Attaching training to one would write a person back onto
    // the row their erasure emptied (0011).
    if (held.anonymisedAt !== null) {
      throw createError({
        statusCode: 409,
        statusMessage: 'That account has been erased, so nothing can be recorded against it',
      })
    }
    return { id: held.id, name: held.name, created: false }
  }

  if (undeliverableReason({ email, anonymisedAt: null })) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing can be delivered to that address' })
  }

  // Their own name if the trainer knows it, and the address if not: a guess would be theirs to
  // correct later, and the address is at least what was written down.
  const name = input.name?.trim() || email
  const id = await createAccount({ email, name, passwordHash: null, actorId: resolved.account.id })

  return { id, name, created: true }
})
