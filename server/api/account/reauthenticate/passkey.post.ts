import { eq } from 'drizzle-orm'
import { reauthenticationOptions, refusalForCounter, refusalForVerification } from '#shared/utils/passkeys'

// Reassert identity with the passkey already on this account (A-128 criterion 3).
export default defineWebAuthnAuthenticateEventHandler({
  async getOptions(event) {
    const account = await requireAccount(event)
    const passkeys = await credentialsOf(account.id)
    return reauthenticationOptions(passkeys.map(passkey => passkey.id))
  },

  async storeChallenge(event, challenge, attemptId) {
    const account = await requireAccount(event)
    await storeChallenge(attemptId, challenge, account.id)
  },

  getChallenge: (_event, attemptId) => takeChallenge(attemptId),

  async getCredential(event, credentialId) {
    const account = await requireAccount(event)
    const credential = await credentialById(credentialId)
    // Scoped to this account: reasserting cannot succeed with somebody else's passkey.
    if (!credential || credential.userId !== account.id) {
      throw createError({ statusCode: 401, statusMessage: 'That is not a passkey on this account' })
    }
    return credential
  },

  async onSuccess(event, { credential, authenticationInfo }) {
    const account = await requireAccount(event)

    const refusal = refusalForVerification(authenticationInfo.userVerified)
      ?? refusalForCounter(credential.counter, authenticationInfo.newCounter)
    if (refusal) throw createError({ statusCode: 401, statusMessage: refusal })

    await db.batch([
      db.update(schema.passkeys)
        .set({ counter: authenticationInfo.newCounter, lastUsedAt: Math.floor(Date.now() / 1000) })
        .where(eq(schema.passkeys.credentialId, credential.id)),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: account.id,
        action: 'session.reauthenticated',
        target: `user:${account.id}`,
        detail: { factor: 'passkey' },
      })),
    ])

    await reassertSession(event, account, 'passkey')
  },
})
