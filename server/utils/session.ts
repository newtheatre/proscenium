import type { H3Event } from 'h3'
import type { User } from '#auth-utils'

/**
 * Session reads for this app. Staleness applies to roles, not to identity —
 * a stale session keeps `user.id` and loses its `proscenium:` roles (ADR-0008).
 */

/** True if the session carries any role in this app's namespace. */
function holdsAppRoles(user: User): boolean {
  return user.roles?.some(role => role.startsWith('proscenium:')) ?? false
}

/**
 * **MUST NOT throw** — authorize() swallows anything that is not an
 * AuthorizationError and then runs the handler unchecked (ADR-0008).
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
    // Returning null denies; throwing would be swallowed and would grant.
    console.error('[auth] session resolution failed, denying:', error)
    return null
  }
}

/**
 * As {@link sessionUserForAuthorization}, but 401s when nobody is signed in.
 * For handlers that need to know who is asking and nothing more.
 */
export async function requireSessionUser(event: H3Event): Promise<User> {
  const user = await sessionUserForAuthorization(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
