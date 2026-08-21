import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { listShifts } from '~~/shared/utils/abilities'

/** GET /api/performances/:id/shifts — the rota for one performance. */
export default defineEventHandler(async (event) => {
  await authorize(event, listShifts)

  const performanceId = getRouterParam(event, 'id')
  if (!performanceId) throw createError({ statusCode: 400, statusMessage: 'Performance ID is required' })

  // Name only: FRONT_OF_HOUSE holders read this and must not see emails.
  return db.select({
    id: schema.performanceShifts.id,
    role: schema.performanceShifts.role,
    status: schema.performanceShifts.status,
    needsEligibilityReview: schema.performanceShifts.needsEligibilityReview,
    notes: schema.performanceShifts.notes,
    confirmedAt: schema.performanceShifts.confirmedAt,
    userId: schema.performanceShifts.userId,
    userName: schema.users.name,
  })
    .from(schema.performanceShifts)
    .leftJoin(schema.users, eq(schema.performanceShifts.userId, schema.users.id))
    .where(eq(schema.performanceShifts.performanceId, performanceId))
    .orderBy(asc(schema.performanceShifts.role), asc(schema.performanceShifts.createdAt))
})
