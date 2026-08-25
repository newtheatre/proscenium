import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'
import { z } from 'zod'
import { listShifts } from '~~/shared/utils/abilities'

const DAY_MS = 24 * 60 * 60 * 1000
/** In line with the sibling lists: `mine` caps at 120 days, `unstaffed` at 90. */
const DEFAULT_WINDOW_DAYS = 60
const MAX_WINDOW_DAYS = 120

const querySchema = z.object({
  /** `YYYY-MM-DD`, inclusive, resolved in Europe/London. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** Calendar arithmetic on a `YYYY-MM-DD`, in UTC so no DST hour can move a day. */
function utcDay(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** GET /api/shifts: every shift on performances in a date window. */
export default defineEventHandler(async (event) => {
  await authorize(event, listShifts)

  const { from, to } = await getValidatedQuery(event, querySchema.parse)

  // The window is the only thing bounding this list, so it always has one: an
  // unparameterised call would otherwise read every shift ever stamped (ADR-0005).
  const start = from ?? londonDate()
  const end = to ?? new Date(utcDay(start) + DEFAULT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10)

  if ((utcDay(end) - utcDay(start)) / DAY_MS > MAX_WINDOW_DAYS) {
    throw createError({
      statusCode: 400,
      statusMessage: `Ask for at most ${MAX_WINDOW_DAYS} days of rota at a time.`,
    })
  }

  // Bounded by the performance's own start time, so the parameter count does
  // not grow with the number of rows covered (ADR-0006).
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
    .where(and(
      ne(schema.performances.status, 'CANCELLED'),
      gte(schema.performances.startsAt, validityStart(start)),
      lte(schema.performances.startsAt, validityEnd(end)),
      ourBuildingPredicate(),
    ))
    .orderBy(asc(schema.performances.startsAt), asc(schema.performanceShifts.role))
})
