import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** POST /api/bar/comps/:id/decline — no, and nothing is recorded. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!

  // Not requireBarScope: the duty manager decides without working the bar.
  const { night } = await requireFohScope(user)
  requireCompApprover(await mayApproveComps(user, night))

  const request = await db.select({
    status: schema.compRequests.status,
    night: schema.compRequests.night,
  }).from(schema.compRequests).where(eq(schema.compRequests.id, id)).get()

  if (!request) throw createError({ statusCode: 404, statusMessage: 'That request no longer exists.' })
  if (request.night !== night) {
    throw createError({ statusCode: 409, statusMessage: 'That request is from another night.' })
  }
  if (request.status !== 'PENDING') {
    throw createError({ statusCode: 409, statusMessage: `That request was already ${request.status.toLowerCase()}.` })
  }

  await db.update(schema.compRequests).set({
    status: 'DECLINED',
    decidedByUserId: user.id,
    decidedAt: sql`(current_timestamp)`,
  }).where(eq(schema.compRequests.id, id))

  return { id, status: 'DECLINED' }
})
