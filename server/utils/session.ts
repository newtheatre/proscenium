import type { H3Event } from 'h3'
import type { User } from '#auth-utils'

/**
 * Read the session and reject it when its roles are too stale to trust.
 *
 * Identity now lives in the central auth service (stage-door); the sealed
 * `nnt-session` cookie is read-only here, and the old per-request epoch
 * lookup is replaced by the estate staleness rule: a session older than 15
 * minutes (since the auth service last re-read the DB) must not have its
 * roles honoured. Role-less users have nothing stale to honour, so ordinary
 * audience browsing never round-trips anywhere — only staff sessions get
 * bounced through `auth.newtheatre.org.uk/api/session/refresh`, which
 * re-reads roles and rejects revoked/disabled accounts (that is where the
 * epoch check lives now).
 *
 * Any handler that makes an authorisation decision from `session.user`
 * (especially `roles`) must come through here, or a demoted volunteer keeps
 * their old access for the life of the cookie.
 */
export async function getVerifiedSessionUser(event: H3Event): Promise<User | null> {
  const session = await getUserSession(event)
  const sessionUser = session?.user
  if (!sessionUser) return null

  const holdsRoles = sessionUser.roles?.some(role => role.startsWith('proscenium:'))
  if (holdsRoles && isStale(session)) {
    // 401 with a hint the client middleware understands — it redirects the
    // browser through the auth service's refresh endpoint.
    throw createError({
      statusCode: 401,
      statusMessage: 'Session refresh required',
      data: { stale: true },
    })
  }

  return sessionUser
}

/** As {@link getVerifiedSessionUser}, but 401s rather than returning null. */
export async function requireVerifiedSessionUser(event: H3Event): Promise<User> {
  const user = await getVerifiedSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
