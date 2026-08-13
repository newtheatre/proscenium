import type { H3Event } from 'h3'
import type { User } from '#auth-utils'

/**
 * Staleness applies to **roles**, not to identity.
 *
 * Identity lives in the central auth service (stage-door); the sealed
 * `nnt-session` cookie is read-only here, and the old per-request epoch lookup
 * is replaced by the estate staleness rule: a session older than 15 minutes
 * (since the auth service last re-read the DB) must not have its roles
 * honoured. Role-less users have nothing stale to honour, so ordinary audience
 * browsing never round-trips anywhere — only staff sessions get bounced through
 * `auth.newtheatre.org.uk/api/session/refresh`, which re-reads roles and rejects
 * revoked or disabled accounts (that is where the epoch check lives now).
 *
 * **Who someone is does not go stale.** The cookie is sealed and unexpired, so
 * `user.id` is as trustworthy at 20 minutes as at 20 seconds; it is the role
 * list that may have been revoked centrally since. An earlier version of this
 * module threw a 401 for any stale role-holding session, which meant a staff
 * member could not see their own bookings on /account/reservations after
 * fifteen minutes — an identity-only query refused because a role list nobody
 * had consulted might be out of date.
 *
 * So there is one resolver, it never throws, and it drops the roles it cannot
 * vouch for. Ownership checks keep working; staff checks fail closed until the
 * browser refreshes.
 */

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

/**
 * As {@link sessionUserForAuthorization}, but 401s when nobody is signed in.
 *
 * For handlers that need to know *who* is asking and nothing more — listing
 * your own bookings, say. A stale session is signed in, so it is served; it
 * simply arrives without roles, which such a handler was never going to read.
 */
export async function requireSessionUser(event: H3Event): Promise<User> {
  const user = await sessionUserForAuthorization(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
