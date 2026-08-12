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
 *
 * NOTE: this throws, so it must NOT be used as nuxt-authorization's
 * `resolveServerUser` — see {@link sessionUserForAuthorization}.
 */
export async function getVerifiedSessionUser(event: H3Event): Promise<User | null> {
  const session = await getUserSession(event)
  const sessionUser = session?.user
  if (!sessionUser) return null

  if (holdsAppRoles(sessionUser) && isStale(session)) {
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

/** True if the session carries any role in this app's namespace. */
function holdsAppRoles(user: User): boolean {
  return user.roles?.some(role => role.startsWith('proscenium:')) ?? false
}

/**
 * The user nuxt-authorization evaluates abilities against.
 *
 * **This function must never throw.** nuxt-authorization's server `authorize()`
 * wraps `resolveServerUser()` in a try/catch that only re-throws
 * `AuthorizationError` (see `nuxt-authorization/dist/runtime/server/utils/
 * bouncer.js`) — every other error is swallowed and `authorize()` then resolves
 * *successfully*, running the handler with no authorization check at all. A
 * resolver that threw on stale sessions therefore turned the staleness rule
 * into a privilege escalation: because sessions last 30 days and go stale after
 * 15 minutes, the ordinary state of a staff session granted every ability in
 * the app.
 *
 * So staleness is expressed as data, not as an exception: a stale session keeps
 * its identity (the cookie is sealed and unexpired — who they are is not in
 * doubt) but loses its `proscenium:` roles, which are the only part the
 * staleness rule distrusts. Every staff ability then fails closed, while
 * ownership checks like `readReservation`'s `user.id === resource.userId` still
 * work. The client middleware bounces the browser through the auth service's
 * refresh endpoint independently, so the refresh UX is unaffected.
 */
export async function sessionUserForAuthorization(event: H3Event): Promise<User | null> {
  try {
    const session = await getUserSession(event)
    const sessionUser = session?.user
    if (!sessionUser) return null

    if (holdsAppRoles(sessionUser) && isStale(session)) {
      return { ...sessionUser, roles: sessionUser.roles.filter(r => !r.startsWith('proscenium:')) }
    }

    return sessionUser
  }
  catch (error) {
    // Unreadable/!tampered cookie, or anything else unexpected. Returning null
    // denies; throwing here would be swallowed and would *grant*.
    console.error('[auth] session resolution failed, denying:', error)
    return null
  }
}
