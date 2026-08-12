import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { anonymiseUserAccount } from '~~/shared/utils/abilities'

/**
 * POST /api/users/:id/anonymise — close an account by erasing the person,
 * keeping the bookings. Own account, or ADMIN for someone else's.
 *
 * This is what answers a request to be removed. Deleting the row is not
 * available to anyone with booking history: `reservations.userId` is
 * `onDelete: 'restrict'`, and the sales record has to survive for the
 * treasurer's accounts. So the row stays and the person is removed from it.
 *
 * Irreversible, and deliberately so — that is the point of the request.
 */
export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')
  if (!userId) throw createError({ statusCode: 400, statusMessage: 'User ID is required' })

  const user = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()

  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await authorize(event, anonymiseUserAccount, { id: userId })

  // Roles live in the central auth service now, so the old local "still
  // holds a staff role" refusal can't be checked here. The one case this app
  // CAN see is the caller anonymising themselves while holding staff roles —
  // refuse that; for other targets, remove roles in the auth admin first
  // (stage-door Phase 7 will orchestrate erasure centrally, roles included).
  const callerSession = await getUserSession(event)
  const selfWithRoles = callerSession.user?.id === userId
    && callerSession.user.roles?.some(r => r.startsWith('proscenium:'))

  if (selfWithRoles) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This account still holds a staff role. Remove the role first (auth service admin), so it is clear who is taking over that responsibility.',
    })
  }

  // Refuse while the person still has something to turn up to: the box office
  // would have a booking it cannot put a name to on the door.
  const upcoming = await db
    .select({ id: schema.reservations.id })
    .from(schema.reservations)
    .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .where(and(
      eq(schema.reservations.userId, userId),
      eq(schema.reservations.status, 'PENDING'),
    ))
    .get()

  if (upcoming) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This account has a booking that has not been collected yet. Cancel it first, then close the account.',
    })
  }

  const result = await anonymiseUser(userId)

  if (result.alreadyAnonymised) {
    return { message: 'This account has already been closed.', reservationsAffected: 0 }
  }

  // Note: the estate session is NOT cleared here — only the auth service
  // writes that cookie (single-writer rule), and the central identity
  // survives this app-local scrub. Until stage-door Phase 7 orchestrates
  // full erasure, pair this with disable/force-logout in the auth admin.
  return {
    message: 'The account has been closed on this site and its personal details removed here. Booking records are kept without them. To close the NNT account itself, use the NNT account service.',
    reservationsAffected: result.reservationsAffected,
  }
})
