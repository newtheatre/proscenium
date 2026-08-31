import { eq } from 'drizzle-orm'
import { refusalForVerification, registrationOptions } from '#shared/utils/passkeys'

// Enrol a passkey on the signed-in account.
export default defineWebAuthnRegisterEventHandler({
  // The client sends a userName; it is ignored. Enrolment is for whoever holds the session, and a
  // borrowed screen must not be able to add a way in (A-105 criterion 3, A-113 criterion 2).
  async validateUser(_body, event) {
    const account = await requireAccount(event)
    await requireFreshSession(event)
    return { userName: account.email, displayName: account.name, id: account.id }
  },

  getOptions: (_event, _body) => registrationOptions(),

  async excludeCredentials(event) {
    const account = await requireAccount(event)
    return (await credentialsOf(account.id)).map(credential => ({ id: credential.id }))
  },

  async storeChallenge(event, challenge, attemptId) {
    const account = await requireAccount(event)
    await storeChallenge(attemptId, challenge, account.id)
  },

  getChallenge: (_event, attemptId) => takeChallenge(attemptId),

  async onSuccess(event, { user, credential, registrationInfo }) {
    const refusal = refusalForVerification(registrationInfo.userVerified)
    if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

    const userId = String(user.id)
    await db.batch([
      db.insert(schema.passkeys).values({
        id: newId(),
        userId,
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? null,
        backedUp: credential.backedUp,
        // Named by the person later; a device name from the browser is not one to trust.
        label: null,
      }),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: userId,
        action: 'account.method.added',
        target: `user:${userId}`,
        detail: { method: 'passkey' },
      })),
    ])

    await db.update(schema.users)
      .set({ updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(schema.users.id, userId))
  },
})
