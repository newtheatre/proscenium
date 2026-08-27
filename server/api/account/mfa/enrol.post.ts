import { sql } from 'drizzle-orm'
import { enrolmentUri, generateSecret } from '#shared/utils/totp'

// Begin enrolling an authenticator app. The factor is inactive until confirmed with a code.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  if (await confirmedFactor(account.id)) {
    throw createError({ statusCode: 409, statusMessage: 'This account already has an authenticator app' })
  }

  const secret = generateSecret()
  await db.insert(schema.totpSecrets)
    .values({ userId: account.id, secret })
    .onConflictDoUpdate({
      target: schema.totpSecrets.userId,
      // Starting again replaces an unconfirmed enrolment outright, including any step it used.
      set: { secret, confirmedAt: null, lastUsedStep: null, createdAt: sql`(unixepoch())` },
    })

  return { secret, uri: enrolmentUri(secret, account.email) }
})
