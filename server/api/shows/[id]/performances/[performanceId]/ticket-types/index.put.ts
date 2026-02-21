import { shows, performances, ticketTypes, performanceTicketTypeOverrides } from 'hub:db:schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updatePerformance } from '~~/shared/utils/abilities'
import { nanoid } from 'nanoid'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1, 'Ticket type ID is required'),
  price: z.number().int().nonnegative().optional().nullable(),
  active: z.boolean().optional().nullable(),
})

/**
 * PUT /api/shows/:id/performances/:performanceId/ticket-types
 *
 * Upserts a performance-level ticket type override.
 */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, updatePerformance)

  const show = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const performance = await db.select().from(performances)
    .where(and(eq(performances.id, performanceId), eq(performances.showId, showId)))
    .get()
  if (!performance) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  const ticketType = await db.select().from(ticketTypes).where(eq(ticketTypes.id, body.ticketTypeId)).get()
  if (!ticketType) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  const existing = await db.select()
    .from(performanceTicketTypeOverrides)
    .where(and(
      eq(performanceTicketTypeOverrides.performanceId, performanceId),
      eq(performanceTicketTypeOverrides.ticketTypeId, body.ticketTypeId),
    ))
    .get()

  if (existing) {
    await db.update(performanceTicketTypeOverrides)
      .set({
        price: body.price ?? null,
        active: body.active ?? null,
      })
      .where(eq(performanceTicketTypeOverrides.id, existing.id))
      .run()
  }
  else {
    await db.insert(performanceTicketTypeOverrides)
      .values({
        id: nanoid(),
        performanceId,
        ticketTypeId: body.ticketTypeId,
        price: body.price ?? null,
        active: body.active ?? null,
      })
      .run()
  }

  return { ok: true }
})
