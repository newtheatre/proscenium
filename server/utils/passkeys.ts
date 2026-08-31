import { and, eq, gt, lt } from 'drizzle-orm'
import { PASSKEY_CHALLENGE_TTL_SECONDS } from '#shared/utils/passkeys'
import type { WebAuthnCredential } from '#auth-utils'

// The challenge store and the credential lookup. A challenge is single use: it is taken, not read,
// so a replayed response finds nothing (A-105).

export async function storeChallenge(id: string, challenge: string, userId: string | null): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.insert(schema.passkeyChallenges).values({
      id,
      challenge,
      userId,
      expiresAt: now + PASSKEY_CHALLENGE_TTL_SECONDS,
    }),
    // Swept on the way in rather than on a schedule: the table is small and only this path grows it.
    db.delete(schema.passkeyChallenges).where(lt(schema.passkeyChallenges.expiresAt, now)),
  ])
}

export async function takeChallenge(id: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const [row] = await db.select({ challenge: schema.passkeyChallenges.challenge })
    .from(schema.passkeyChallenges)
    .where(and(eq(schema.passkeyChallenges.id, id), gt(schema.passkeyChallenges.expiresAt, now)))
    .limit(1)

  await db.delete(schema.passkeyChallenges).where(eq(schema.passkeyChallenges.id, id))
  if (!row) throw createError({ statusCode: 410, statusMessage: 'That attempt has expired. Try again.' })
  return row.challenge
}

export interface StoredCredential extends WebAuthnCredential { userId: string }

export async function credentialById(credentialId: string): Promise<StoredCredential | undefined> {
  const [row] = await db.select({
    id: schema.passkeys.credentialId,
    userId: schema.passkeys.userId,
    publicKey: schema.passkeys.publicKey,
    counter: schema.passkeys.counter,
    backedUp: schema.passkeys.backedUp,
    transports: schema.passkeys.transports,
  })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.credentialId, credentialId))
    .limit(1)

  return row as StoredCredential | undefined
}

// Offered to the browser so it does not enrol a second credential from an authenticator that
// already holds one (A-113: the same device should not appear twice).
export async function credentialsOf(userId: string): Promise<{ id: string }[]> {
  return db.select({ id: schema.passkeys.credentialId })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId))
}
