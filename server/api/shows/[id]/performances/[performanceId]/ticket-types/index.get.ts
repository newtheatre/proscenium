import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/performances/:performanceId/ticket-types
 *
 * Returns all ticket types with their effective price and active status for a specific
 * performance, reflecting the full override chain:
 *   performance override → show override → base ticket type default
 */
/** GET /api/shows/:id/performances/:performanceId/ticket-types — get ticket type overrides for a performance. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, readShow)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const performance = await db.select().from(schema.performances)
    .where(and(eq(schema.performances.id, performanceId), eq(schema.performances.showId, showId)))
    .get()
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  const [allTypes, showOverrides, perfOverrides] = await Promise.all([
    db.select().from(schema.ticketTypes).orderBy(schema.ticketTypes.name).all(),
    db.select().from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, showId))
      .all(),
    db.select().from(schema.performanceTicketTypeOverrides)
      .where(eq(schema.performanceTicketTypeOverrides.performanceId, performanceId))
      .all(),
  ])

  const showOverrideMap = new Map(showOverrides.map(o => [o.ticketTypeId, o]))
  const perfOverrideMap = new Map(perfOverrides.map(o => [o.ticketTypeId, o]))
  const ctx = { baseTypes: allTypes, showOverrides, perfOverrides }

  return allTypes.map((tt) => {
    const { effectivePrice, active } = resolveEffectiveTicketType(tt.id, ctx)
    return {
      ...tt,
      showOverride: showOverrideMap.get(tt.id) ?? null,
      perfOverride: perfOverrideMap.get(tt.id) ?? null,
      effectivePrice,
      effectiveActive: active,
    }
  })
})
