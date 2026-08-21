import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm'

/**
 * The rota. A confirmed shift is what scopes the show night screen and the
 * access-needs visibility rule, so it is a control (ADR-0019, ADR-0022).
 */

/** How far ahead the admin screen warns about a performance with no duty manager. */
export const DUTY_MANAGER_WARNING_DAYS = 7

/**
 * The slots a new performance starts with: the venue's own template rows, or
 * the estate default (`venue_id is null`) when the venue has none.
 */
export async function templateSlotsFor(venueId: string): Promise<Array<{ role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', count: number }>> {
  const own = await db.select({ role: schema.shiftTemplates.role, count: schema.shiftTemplates.count })
    .from(schema.shiftTemplates)
    .where(eq(schema.shiftTemplates.venueId, venueId))

  if (own.length) return own

  return db.select({ role: schema.shiftTemplates.role, count: schema.shiftTemplates.count })
    .from(schema.shiftTemplates)
    .where(isNull(schema.shiftTemplates.venueId))
}

/**
 * Insert statements stamping a performance's open slots. Returns nothing when
 * the performance already has shifts, so re-running is safe.
 */
export async function stampTemplateShifts(performanceId: string, venueId: string): Promise<BatchItem<'sqlite'>[]> {
  const [existing] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.performanceShifts)
    .where(eq(schema.performanceShifts.performanceId, performanceId))
  if ((existing?.n ?? 0) > 0) return []

  const slots = await templateSlotsFor(venueId)
  const rows = slots.flatMap(({ role, count }) =>
    Array.from({ length: Math.max(0, count) }, () => ({ performanceId, role, status: 'OPEN' as const })),
  )
  if (!rows.length) return []

  return [db.insert(schema.performanceShifts).values(rows)]
}

/**
 * Refuses a second confirmed duty manager with a readable message. The unique
 * index is the real guarantee; this is so staff see a sentence, not a 500.
 */
export async function assertDutyManagerFree(performanceId: string, exceptShiftId?: string): Promise<void> {
  const clauses = [
    eq(schema.performanceShifts.performanceId, performanceId),
    eq(schema.performanceShifts.role, 'DUTY_MANAGER'),
    eq(schema.performanceShifts.status, 'CONFIRMED'),
  ]
  const rows = await db.select({ id: schema.performanceShifts.id })
    .from(schema.performanceShifts).where(and(...clauses))

  if (rows.some(r => r.id !== exceptShiftId)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This performance already has a confirmed duty manager. Reassign the existing shift instead of adding a second.',
    })
  }
}

/**
 * Performances starting within `days` that have no confirmed duty manager.
 * Scoped by a correlated subquery, never an id list (ADR-0006).
 */
export async function performancesMissingDutyManager(days = DUTY_MANAGER_WARNING_DAYS) {
  const now = new Date()
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  return db.select({
    performanceId: schema.performances.id,
    startsAt: schema.performances.startsAt,
    showId: schema.performances.showId,
    showTitle: schema.shows.title,
    venueName: schema.venues.name,
  })
    .from(schema.performances)
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .where(and(
      gte(schema.performances.startsAt, now),
      lte(schema.performances.startsAt, until),
      eq(schema.performances.status, 'ON_SALE'),
      sql`not exists (
        select 1 from performance_shifts ps
        where ps.performance_id = ${schema.performances.id}
          and ps.role = 'DUTY_MANAGER'
          and ps.status = 'CONFIRMED'
      )`,
    ))
    .orderBy(asc(schema.performances.startsAt))
}
