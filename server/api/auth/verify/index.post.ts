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
  const account = await findById(claimed.userId)
  if (claimed.email !== null && (!account || normaliseEmail(account.email) !== normaliseEmail(claimed.email))) {
    throw createError({ statusCode: 410, statusMessage: 'That link was for a different address. Ask for a new one.' })
  }

  // Opened in the browser that registered, the link is a sign-in as well; anywhere else, or for a
  // changed address, it only confirms, and a second factor always keeps its own step (0103).
  const registeredHere = await takeRegistration(event)
  const signsIn = Boolean(account && claimed.email === null && registeredHere === normaliseEmail(account.email)
    && !account.disabled && account.anonymisedAt === null && !await confirmedFactor(account.id))

  await db.batch([
    db.delete(schema.authTokens).where(eq(schema.authTokens.userId, claimed.userId)),
    db.update(schema.users).set({ verified: true, ...(signsIn ? { lastLoginAt: Math.floor(Date.now() / 1000) } : {}) }).where(eq(schema.users.id, claimed.userId)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: claimed.userId,
      action: 'account.verified',
      target: `user:${claimed.userId}`,
      detail: changes({ verified: [false, true] }),
    })),
    ...(signsIn
      ? [db.insert(schema.auditLog).values(auditEntry({ actorId: claimed.userId, action: 'session.started.magic-link', target: `user:${claimed.userId}` }))]
      : []),
  ])

  if (signsIn) await startSession(event, { ...account!, verified: true }, 'magic-link')
  return { ok: true, signedIn: signsIn }
})
