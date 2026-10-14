import { PERSONAS, PERSONA_TOTP_SECRET } from '#shared/utils/personas'
import { enrolmentUri } from '#shared/utils/totp'

// What a developer needs to know before doing anything: who is signed in, what that resolves to,
// who they could be instead, and what the system has tried to send (K-124).
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const account = session?.user ? await findById(session.user.id) : undefined

  const seeded = await personaAccounts()

  const uri = enrolmentUri(PERSONA_TOTP_SECRET, 'any seeded persona')
  const grants = account ? await liveGrants(account.id) : []

  return {
    session: account
      ? {
          id: account.id,
          name: account.name,
          email: account.email,
          roles: grants.map(grant => grant.role),
          permissions: [...permissionsFor(grants, new Date())].sort(),
          factor: await confirmedFactor(account.id),
        }
      : null,
    personas: await Promise.all(PERSONAS.map(async (persona) => {
      const made = seeded.get(persona.email) ?? null
      return { ...persona, account: made, factor: made ? await confirmedFactor(made.id) : false }
    })),
    mailbox: await mailbox(),
    // One secret, shared by every seeded 'full' persona: enrol it once and it survives a reseed.
    totp: { secret: PERSONA_TOTP_SECRET, uri, qr: `data:image/svg+xml;base64,${qrSvgBase64(uri)}` },
  }
})
