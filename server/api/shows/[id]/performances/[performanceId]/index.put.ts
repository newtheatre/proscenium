import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { updatePerformance } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  venueId: z.string().min(1).optional(),
  startsAt: z.number().int().optional(),
  doorsAt: z.number().int().optional().nullable(),
  durationMinutes: z.number().int().positive().optional().nullable(),
  intervalCount: z.number().int().nonnegative().optional(),
  intervalMinutes: z.number().int().positive().optional().nullable(),
  capacityOverride: z.number().int().positive().optional().nullable(),
  bookingClosesHoursBefore: z.number().int().nonnegative().max(168).optional().nullable(),
  /** Sold by someone else for this date only (ADR-0029). */
  externalBookingUrl: z.string().trim().url().nullable().optional(),
  status: z.enum(['DRAFT', 'ON_SALE', 'CANCELLED']).optional(),
  notes: z.string().optional().nullable(),
})

/** PUT /api/shows/:id/performances/:performanceId — update a performance. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, updatePerformance)

  const existing = await db.select().from(schema.performances)
    .where(and(eq(schema.performances.id, performanceId), eq(schema.performances.showId, showId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Capacity cannot go below what is already sold, or assertCapacity refuses
  // every later change for this performance (ADR-0007).
  if (body.capacityOverride !== undefined && body.capacityOverride !== null) {
    const sold = await countOccupiedSeatsFor(performanceId)
    if (body.capacityOverride < sold) {
      throw createError({
        statusCode: 409,
        statusMessage: `This performance has already sold ${sold} tickets, so capacity cannot be set to ${body.capacityOverride}. Refund or cancel tickets first.`,
      })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (body.venueId !== undefined) updateData.venueId = body.venueId
  if (body.startsAt !== undefined) updateData.startsAt = new Date(body.startsAt * 1000)
  if (body.doorsAt !== undefined) updateData.doorsAt = body.doorsAt ? new Date(body.doorsAt * 1000) : null
  if (body.durationMinutes !== undefined) updateData.durationMinutes = body.durationMinutes
  if (body.intervalCount !== undefined) updateData.intervalCount = body.intervalCount
  if (body.intervalMinutes !== undefined) updateData.intervalMinutes = body.intervalMinutes
  if (body.capacityOverride !== undefined) updateData.capacityOverride = body.capacityOverride
  if (body.bookingClosesHoursBefore !== undefined) updateData.bookingClosesHoursBefore = body.bookingClosesHoursBefore
  if (body.externalBookingUrl !== undefined) updateData.externalBookingUrl = body.externalBookingUrl
  if (body.status !== undefined) updateData.status = body.status
  if (body.notes !== undefined) updateData.notes = body.notes

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db.update(schema.performances)
    .set(updateData)
    .where(eq(schema.performances.id, performanceId))
    .returning()

  return updated
})
