import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(120).optional().default(60),
})

/**
 * GET /api/shifts/mine: upcoming performances, their open slots and who is
 * already on. Any member with an account may see this (docs/12 §3.3).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { days } = await getValidatedQuery(event, querySchema.parse)

  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const rows = await db.select({
    id: schema.performanceShifts.id,
    role: schema.performanceShifts.role,
    status: schema.performanceShifts.status,
    userId: schema.performanceShifts.userId,
    // A first name is enough to see who is on; the rota is not a directory.
    holderName: schema.users.name,
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
      gte(schema.performances.startsAt, new Date()),
      // Bounded in SQL, so `days` costs nothing to widen (ADR-0005).
      lte(schema.performances.startsAt, until),
      ne(schema.performances.status, 'CANCELLED'),
      // A venue we do not run has no rota to claim from (ADR-0029).
      ourBuildingPredicate(),
    ))
    .orderBy(asc(schema.performances.startsAt), asc(schema.performanceShifts.role))

  // Per role, not per slot: three questions however long the rota is, and
  // `isEligible` caches, so this does not hammer rehearsal (ADR-0026).
  const eligibility: Record<string, { eligible: boolean, missing: string[], needsReview: boolean }> = {}
  for (const role of schema.SHIFT_ROLES) {
    eligibility[role] = await isEligible(user.id, SHIFT_ELIGIBILITY[role])
  }

  return {
    slots: rows
      .map(row => ({
        ...row,
        holderName: row.holderName ? row.holderName.split(' ')[0] ?? null : null,
        mine: row.userId === user.id,
      })),
    eligibility,
  }
})
