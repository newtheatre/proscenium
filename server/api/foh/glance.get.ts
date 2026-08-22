import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/** GET /api/foh/glance: the numbers, and what the door gets asked. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)
  scopedPerformance(scope, performanceId)

  const performance = await db.select({
    durationMinutes: schema.performances.durationMinutes,
    intervalCount: schema.performances.intervalCount,
    intervalMinutes: schema.performances.intervalMinutes,
    capacityOverride: schema.performances.capacityOverride,
    venueCapacity: schema.venues.capacity,
    showId: schema.shows.id,
    showTitle: schema.shows.title,
    ageGuidance: schema.shows.ageGuidance,
    latecomerPolicy: schema.shows.latecomerPolicy,
    contentWarningNotes: schema.shows.contentWarningNotes,
    warningsConfirmedNone: schema.shows.warningsConfirmedNone,
  })
    .from(schema.performances)
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!performance) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  // The one seat-counting rule (ADR-0007). Anything else here would be a
  // second definition of a full house.
  const sold = await countOccupiedSeatsFor(performanceId)

  const collected = await countCollectedSeatsFor(performanceId)

  const capacity = performance.capacityOverride ?? performance.venueCapacity
  const remaining = capacity === null ? null : Math.max(0, capacity - sold)

  const warnings = await db.select({ title: schema.contentWarnings.title, level: schema.showContentWarnings.level })
    .from(schema.showContentWarnings)
    .innerJoin(schema.contentWarnings, eq(schema.showContentWarnings.contentWarningId, schema.contentWarnings.id))
    .where(eq(schema.showContentWarnings.showId, performance.showId))
    .orderBy(asc(schema.contentWarnings.sort), asc(schema.contentWarnings.title))

  return {
    numbers: {
      sold,
      collected,
      capacity,
      /** Null means uncapped, not zero: the screen must not read "no room". */
      remaining,
    },
    show: {
      title: performance.showTitle,
      durationMinutes: performance.durationMinutes,
      intervalCount: performance.intervalCount,
      intervalMinutes: performance.intervalMinutes,
      ageGuidance: performance.ageGuidance,
      latecomerPolicy: performance.latecomerPolicy,
      contentWarningNotes: performance.contentWarningNotes,
      warningsConfirmedNone: performance.warningsConfirmedNone,
      warnings,
    },
  }
})
