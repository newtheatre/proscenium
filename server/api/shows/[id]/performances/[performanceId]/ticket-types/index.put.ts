import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updatePerformance } from '~~/shared/utils/abilities'

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

  const body = await readValidatedBody(event, bodySchema.parse)

  const ticketType = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, body.ticketTypeId)).get()
  if (!ticketType) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  const existing = await db.select()
    .from(schema.performanceTicketTypeOverrides)
    .where(and(
      eq(schema.performanceTicketTypeOverrides.performanceId, performanceId),
      eq(schema.performanceTicketTypeOverrides.ticketTypeId, body.ticketTypeId),
    ))
    .get()

  if (existing) {
    const [updated] = await db.update(schema.performanceTicketTypeOverrides)
      .set({
        price: body.price ?? null,
        active: body.active ?? null,
      })
      .where(eq(schema.performanceTicketTypeOverrides.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db.insert(schema.performanceTicketTypeOverrides)
    .values({
      performanceId,
      ticketTypeId: body.ticketTypeId,
      price: body.price ?? null,
      active: body.active ?? null,
    })
    .returning()

  return created
})
