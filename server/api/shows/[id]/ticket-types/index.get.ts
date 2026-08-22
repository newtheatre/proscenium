import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/ticket-types: effective prices and active state,
 * including show-level overrides.
 */
/** GET /api/shows/:id/ticket-types: get ticket type overrides for a show. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, readShow)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const [allTypes, overrides] = await Promise.all([
    db.select().from(schema.ticketTypes).where(sellableTicketTypes()).orderBy(schema.ticketTypes.name).all(),
    db.select().from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, showId))
      .all(),
  ])

  const overrideMap = new Map(overrides.map(o => [o.ticketTypeId, o]))
  // No performance level here, so pass an empty perfOverrides set.
  const ctx = { baseTypes: allTypes, showOverrides: overrides, perfOverrides: [] }

  return allTypes.map((tt) => {
    const { effectivePrice, active } = resolveEffectiveTicketType(tt.id, ctx)
    return {
      ...tt,
      override: overrideMap.get(tt.id) ?? null,
      effectivePrice,
      effectiveActive: active,
    }
  })
})
