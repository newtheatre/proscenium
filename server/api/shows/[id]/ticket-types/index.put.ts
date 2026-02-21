import { shows, ticketTypes, showTicketTypeOverrides } from 'hub:db:schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateShow } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1, 'Ticket type ID is required'),
  price: z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional().nullable(),
})

/**
 * PUT /api/shows/:id/ticket-types
 *
 * Upserts a show-level ticket type override.
 * If price and active are both null, the override is effectively transparent
 * (falls back to the base ticket type defaults).
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  const ticketType = await db.select().from(ticketTypes).where(eq(ticketTypes.id, body.ticketTypeId)).get()
  if (!ticketType) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  // Check for existing override
  const existing = await db.select().from(showTicketTypeOverrides)
    .where(and(
      eq(showTicketTypeOverrides.showId, showId),
      eq(showTicketTypeOverrides.ticketTypeId, body.ticketTypeId),
    ))
    .get()

  if (existing) {
    const [updated] = await db.update(showTicketTypeOverrides)
      .set({ price: body.price ?? null, active: body.active ?? null })
      .where(eq(showTicketTypeOverrides.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db.insert(showTicketTypeOverrides).values({
    showId,
    ticketTypeId: body.ticketTypeId,
    price: body.price ?? null,
    active: body.active ?? null,
  }).returning()

  return created
})
