import { eq } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({ token: z.string().min(20).max(200) })

// Confirm an email address with a token from the verification message.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const claimed = await claimToken(input.token, 'EMAIL_VERIFY')

  // Expired or already spent: not a dead end, an offer of a fresh one (A-102 criterion 3).
  if (!claimed) {
    throw createError({ statusCode: 410, statusMessage: 'That link has expired or has already been used. Ask for a new one.' })
  }

  // A link bound to an address confirms that address and no other: changing again between the
  // send and the click leaves the older link inert (A-115 criterion 1).
  if (claimed.email !== null) {
    const account = await findById(claimed.userId)
    if (!account || normaliseEmail(account.email) !== normaliseEmail(claimed.email)) {
      throw createError({ statusCode: 410, statusMessage: 'That link was for a different address. Ask for a new one.' })
    }
  }

  await db.batch([
    db.delete(schema.authTokens).where(eq(schema.authTokens.userId, claimed.userId)),
    db.update(schema.users).set({ verified: true }).where(eq(schema.users.id, claimed.userId)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: claimed.userId,
      action: 'account.verified',
      target: `user:${claimed.userId}`,
      detail: changes({ verified: [false, true] }),
    })),
  ])

  return { ok: true }
})
