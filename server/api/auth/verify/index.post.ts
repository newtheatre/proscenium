import { eq } from 'drizzle-orm'
import { z } from 'zod'

// A link cut short or mangled in transit says so in house words; a validator's never reaches the page.
const INCOMPLETE = 'That link is incomplete. Ask for a new one.'
const body = z.object({ token: z.string(INCOMPLETE).min(20, INCOMPLETE).max(200, INCOMPLETE) })

// Confirm an email address with a token from the verification message.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const claimed = await claimToken(input.token, 'EMAIL_VERIFY')

  // Expired or already spent: not a dead end, an offer of a fresh one (A-102 criterion 3).
  if (!claimed) {
    throw createError({ statusCode: 410, statusMessage: 'That link has expired or has already been used. Ask for a new one.' })
  }

  const account = await findById(claimed.userId)
  if (claimed.email !== null && (!account || account.anonymisedAt !== null || account.disabled)) {
    throw createError({ statusCode: 410, statusMessage: 'That link has expired or has already been used. Ask for a new one.' })
  }

  // A link bound to a new address is the change itself arriving: only now does the address move,
  // and a session held here is re-sealed against it (0151).
  if (claimed.email !== null && normaliseEmail(account!.email) !== normaliseEmail(claimed.email)) {
    await completeEmailChange(event, account!, normaliseEmail(claimed.email))
    const session = await getUserSession(event)
    if (session.user?.id === account!.id) await resealSession(event, (await findById(account!.id))!)
    return { ok: true, signedIn: false, changed: true }
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
  return { ok: true, signedIn: signsIn, changed: false }
})
