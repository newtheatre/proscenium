import { eq } from 'drizzle-orm'
import { PERSONAS, PERSONA_TOTP_SECRET } from '#shared/utils/personas'
import { enrolmentUri } from '#shared/utils/totp'

// What a developer needs to know before doing anything: who is signed in, what that resolves to,
// who they could be instead, and what the system has tried to send (K-124).
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const account = session?.user ? await findById(session.user.id) : undefined

  const seeded = await personaAccounts()

  const grants = account ? await liveGrants(account.id) : []

  return {
    session: account
      ? {
          id: account.id,
          name: account.name,
          email: account.email,
          roles: grants.map(grant => grant.role),
          permissions: [...permissionsFor(grants, new Date())].sort(),
          factor: Boolean(await db.select({ userId: schema.totpSecrets.userId })
            .from(schema.totpSecrets)
            .where(eq(schema.totpSecrets.userId, account.id))
            .limit(1)
            .then(rows => rows[0])),
        }
      : null,
    personas: PERSONAS.map(persona => ({
      ...persona,
      account: seeded.get(persona.email) ?? null,
    })),
    mailbox: await mailbox(),
    // One secret, shared by every seeded 'full' persona: enrol it once and it survives a reseed.
    totp: { secret: PERSONA_TOTP_SECRET, uri: enrolmentUri(PERSONA_TOTP_SECRET, 'any seeded persona') },
  }
})
