import { shows, ticketTypes, showTicketTypeOverrides } from 'hub:db:schema'
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

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const [allTypes, overrides] = await Promise.all([
    db.select().from(ticketTypes).orderBy(ticketTypes.name).all(),
    db.select().from(showTicketTypeOverrides)
      .where(eq(showTicketTypeOverrides.showId, showId))
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
