import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'

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
      // Whose building, not who sells: a hire is ours to staff, and so is a
      // show here that somebody else ticketed (ADR-0029).
      ourBuildingPredicate(),
      sql`not exists (
        select 1 from performance_shifts ps
        where ps.performance_id = ${schema.performances.id}
          and ps.role = 'DUTY_MANAGER'
          and ps.status = 'CONFIRMED'
      )`,
    ))
    .orderBy(asc(schema.performances.startsAt))
}

/** The single settings row, created on first read. */
export async function rotaSettings() {
  const existing = await db.select().from(schema.rotaSettings)
    .where(eq(schema.rotaSettings.id, 'current')).get()
  if (existing) return existing

  const [created] = await db.insert(schema.rotaSettings).values({ id: 'current' })
    .onConflictDoNothing().returning()
  return created ?? (await db.select().from(schema.rotaSettings)
    .where(eq(schema.rotaSettings.id, 'current')).get())!
}

/** Which rule gates which shift role (docs/13 §5). */
export const SHIFT_ELIGIBILITY: Record<'DUTY_MANAGER' | 'DOOR' | 'BAR', EligibilityRule> = {
  DUTY_MANAGER: 'duty-manager',
  DOOR: 'door',
  BAR: 'bar',
}

/**
 * Performances in a window with no shifts at all, and the statements to stamp
 * them. One query for the gaps and one per venue's template, never per row.
 */
export async function stampMissingShifts(from: Date, to: Date) {
  const gaps = await db.select({
    id: schema.performances.id,
    venueId: schema.performances.venueId,
  })
    .from(schema.performances)
    .where(and(
      // Whose building, not who sells (ADR-0029).
      ourBuildingPredicate(),
      gte(schema.performances.startsAt, from),
      lte(schema.performances.startsAt, to),
      ne(schema.performances.status, 'CANCELLED'),
      sql`not exists (
        select 1 from performance_shifts ps where ps.performance_id = ${schema.performances.id}
      )`,
    ))
    .orderBy(asc(schema.performances.startsAt))

  if (!gaps.length) {
    return { statements: [] as BatchItem<'sqlite'>[], performances: 0, slots: 0, withoutTemplate: 0 }
  }

  // Templates are per venue and venues are few, so this is bounded by venues.
  const templates = new Map<string, Array<{ role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', count: number }>>()
  for (const venueId of new Set(gaps.map(g => g.venueId))) {
    templates.set(venueId, await templateSlotsFor(venueId))
  }

  const statements: BatchItem<'sqlite'>[] = []
  let slots = 0
  let stamped = 0
  // A performance with no template is not "already done": it is unstampable
  // until someone sets one up, and the caller must be able to say so.
  let withoutTemplate = 0
  for (const gap of gaps) {
    const rows = (templates.get(gap.venueId) ?? []).flatMap(({ role, count }) =>
      Array.from({ length: Math.max(0, count) }, () => ({ performanceId: gap.id, role, status: 'OPEN' as const })),
    )
    if (!rows.length) {
      withoutTemplate++
      continue
    }
    // One statement per performance: the parameter count follows the template,
    // not the number of performances covered (ADR-0006).
    statements.push(db.insert(schema.performanceShifts).values(rows))
    slots += rows.length
    stamped++
  }

  return { statements, performances: stamped, slots, withoutTemplate }
}
