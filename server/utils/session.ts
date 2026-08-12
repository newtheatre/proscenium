import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { User } from '#auth-utils'

/**
 * Read the session and reject it if its epoch is stale.
 *
 * `users.sessionEpoch` is bumped on role change, password reset and
 * force-logout. The sealed session cookie carries a snapshot of that value
 * taken at login, so comparing the two is what makes a revocation take effect
 * before the cookie's own expiry.
 *
 * `getUserSession` on its own does not do this — it only unseals the cookie and
 * trusts what is inside. Any handler that makes an authorisation decision from
 * `session.user` (and especially from `session.user.roles`) must come through
 * here instead, or a demoted volunteer keeps their old access, and a session
 * stolen before a password reset survives it.
 *
 * Costs one indexed lookup by primary key.
 */
export async function getVerifiedSessionUser(event: H3Event): Promise<User | null> {
  const session = await getUserSession(event)
  const sessionUser = session?.user
  if (!sessionUser) return null

  const current = await db
    .select({ sessionEpoch: schema.users.sessionEpoch })
    .from(schema.users)
    .where(eq(schema.users.id, sessionUser.id))
    .get()

  if (!current || current.sessionEpoch !== sessionUser.sessionEpoch) return null

  return sessionUser
}

/** As {@link getVerifiedSessionUser}, but 401s rather than returning null. */
export async function requireVerifiedSessionUser(event: H3Event): Promise<User> {
  const user = await getVerifiedSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
