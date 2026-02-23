import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id/ticket-types
 *
 * Returns all ticket types with their effective price and active status
 * for a specific show, reflecting any show-level overrides.
 */
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
    db.select().from(schema.ticketTypes).orderBy(schema.ticketTypes.name).all(),
    db.select().from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, showId))
      .all(),
  ])

  const overrideMap = new Map(overrides.map(o => [o.ticketTypeId, o]))

  return allTypes.map((tt) => {
    const override = overrideMap.get(tt.id) ?? null
    return {
      ...tt,
      override,
      effectivePrice: override?.price ?? tt.price,
      effectiveActive: override?.active ?? tt.activeByDefault,
    }
  })
})
