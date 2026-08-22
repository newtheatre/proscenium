import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'
import { z } from 'zod'
import { listShifts } from '~~/shared/utils/abilities'

const querySchema = z.object({
  /** `YYYY-MM-DD`, inclusive, resolved in Europe/London. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** GET /api/shifts — every shift on performances in a date window. */
export default defineEventHandler(async (event) => {
  await authorize(event, listShifts)

  const { from, to } = await getValidatedQuery(event, querySchema.parse)

  // Bounded by the performance's own start time, so the parameter count does
  // not grow with the number of rows covered (ADR-0006).
  const filters = [ne(schema.performances.status, 'CANCELLED')]
  if (from) filters.push(gte(schema.performances.startsAt, validityStart(from)))
  if (to) filters.push(lte(schema.performances.startsAt, validityEnd(to)))

  return db.select({
    id: schema.performanceShifts.id,
    role: schema.performanceShifts.role,
    status: schema.performanceShifts.status,
    needsEligibilityReview: schema.performanceShifts.needsEligibilityReview,
    userId: schema.performanceShifts.userId,
    userName: schema.users.name,
    performanceId: schema.performances.id,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
    venueName: schema.venues.name,
  })
    .from(schema.performanceShifts)
    .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .leftJoin(schema.users, eq(schema.performanceShifts.userId, schema.users.id))
    .where(and(...filters, ourBuildingPredicate()))
    .orderBy(asc(schema.performances.startsAt), asc(schema.performanceShifts.role))
})
