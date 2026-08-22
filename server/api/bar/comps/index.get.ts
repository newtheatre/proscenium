import { db, schema } from '@nuxthub/db'
import { alias } from 'drizzle-orm/sqlite-core'
import { desc, eq } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/bar/comps: the requester's own, and the approver's queue. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  // Anyone working tonight may poll: the duty manager is often not on the bar,
  // and someone on the bar sees only their own requests.
  const { night } = await requireFohScope(user)
  const mayApprove = await mayApproveComps(user, night)
  const onBar = await canWorkBarTonight(user, night)
  if (!mayApprove && !onBar) {
    throw createError({ statusCode: 403, statusMessage: 'The till is for whoever is on the bar tonight.' })
  }

  const decider = alias(schema.users, 'decider')
  const rows = await db.select({
    id: schema.compRequests.id,
    status: schema.compRequests.status,
    reason: schema.compRequests.reason,
    note: schema.compRequests.note,
    lines: schema.compRequests.lines,
    grossPence: schema.compRequests.grossPence,
    requestedAt: schema.compRequests.requestedAt,
    requestedByUserId: schema.compRequests.requestedByUserId,
    requestedBy: schema.users.name,
    decidedAt: schema.compRequests.decidedAt,
    decidedByUserId: schema.compRequests.decidedByUserId,
    decidedBy: decider.name,
  })
    .from(schema.compRequests)
    .leftJoin(schema.users, eq(schema.users.id, schema.compRequests.requestedByUserId))
    .leftJoin(decider, eq(decider.id, schema.compRequests.decidedByUserId))
    .where(eq(schema.compRequests.night, night))
    .orderBy(desc(schema.compRequests.requestedAt))
    .limit(50)

  // Expiry is derived, so a stale sweep cannot leave a request approvable.
  const decorated = rows.map(row => ({
    ...row,
    status: row.status === 'PENDING' && compExpired(row.requestedAt) ? 'EXPIRED' as const : row.status,
  }))

  return {
    mayApprove,
    awaitingApproval: mayApprove ? decorated.filter(r => r.status === 'PENDING') : [],
    mine: decorated.filter(r => r.requestedByUserId === user.id),
  }
})
