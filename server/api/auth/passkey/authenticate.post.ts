import { eq } from 'drizzle-orm'
import { authenticationOptions, refusalForCounter, refusalForVerification } from '#shared/utils/passkeys'

// Sign in with a passkey.
export default defineWebAuthnAuthenticateEventHandler({
  getOptions: () => authenticationOptions(),

  // Null: a usernameless attempt does not know whose it is until the response verifies.
  storeChallenge: (_event, challenge, attemptId) => storeChallenge(attemptId, challenge, null),
  getChallenge: (_event, attemptId) => takeChallenge(attemptId),

  async getCredential(_event, credentialId) {
    const credential = await credentialById(credentialId)
    if (!credential) throw createError({ statusCode: 401, statusMessage: 'That passkey is not on any account here' })
    return credential
  },

  async onSuccess(event, { credential, authenticationInfo }) {
    const refusal = refusalForVerification(authenticationInfo.userVerified)
      ?? refusalForCounter(credential.counter, authenticationInfo.newCounter)
    if (refusal) throw createError({ statusCode: 401, statusMessage: refusal })

    const account = await findById(credential.userId)
    // The same states the password path refuses, and one message for all of them (A-103).
    if (!account || account.disabled || account.anonymisedAt !== null) {
      throw createError({ statusCode: 401, statusMessage: 'That passkey is not on any account here' })
    }

    const now = Math.floor(Date.now() / 1000)
    await db.batch([
      // Criterion 4: recorded on every use, which is what makes the clone check above mean anything.
      db.update(schema.passkeys)
        .set({ counter: authenticationInfo.newCounter, lastUsedAt: now })
        .where(eq(schema.passkeys.credentialId, credential.id)),
      db.update(schema.users).set({ lastLoginAt: now }).where(eq(schema.users.id, account.id)),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: account.id,
        action: 'session.started.passkey',
        target: `user:${account.id}`,
      })),
    ])

    // No challenge follows: user verification on the authenticator is the second step, so a
    // passkey is a complete sign-in (criterion 2).
    await startSession(event, account)
  },
})
