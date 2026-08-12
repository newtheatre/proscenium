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

  // An account holding a staff role is refused. Anonymising it would leave a
  // nameless row with box-office access, and the role should be removed by
  // someone who has thought about who takes the job over.
  const role = await db
    .select({ role: schema.userRoles.role })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, userId))
    .get()

  if (role) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This account still holds a staff role. Remove the role first, so it is clear who is taking over that responsibility.',
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

  // Closing your own account ends the session with it.
  const session = await getUserSession(event)
  if (session?.user?.id === userId) {
    await clearUserSession(event)
  }

  return {
    message: 'The account has been closed and its personal details removed. Booking records are kept without them.',
    reservationsAffected: result.reservationsAffected,
  }
})
