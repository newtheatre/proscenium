import { db, schema } from '@nuxthub/db'
import { eq, and, inArray } from 'drizzle-orm'
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

/** PUT /api/shows/:id/performances/:performanceId. Update a performance. Admin/Manager only. */
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

  // Effective capacity is the override or the venue's, so both fields are
  // guarded together and neither alone (ADR-0007).
  const nextVenueId = body.venueId ?? existing.venueId
  const venues = await db.select({ id: schema.venues.id, capacity: schema.venues.capacity })
    .from(schema.venues)
    .where(inArray(schema.venues.id, [existing.venueId, nextVenueId]))
  const capacityOf = new Map(venues.map(venue => [venue.id, venue.capacity]))

  // assertCapacity joins venues, so an unknown id would make every later
  // booking answer "Performance not found" instead.
  if (body.venueId !== undefined && !capacityOf.has(body.venueId)) {
    throw createError({ statusCode: 400, statusMessage: 'No such venue' })
  }

  const nextOverride = body.capacityOverride !== undefined ? body.capacityOverride : existing.capacityOverride
  const nextCapacity = nextOverride ?? capacityOf.get(nextVenueId) ?? null
  const nowCapacity = existing.capacityOverride ?? capacityOf.get(existing.venueId) ?? null

  // Only a reduction is checked, so raising capacity can still repair a
  // performance already past its house.
  if (nextCapacity !== null && (nowCapacity === null || nextCapacity < nowCapacity)) {
    const sold = await countOccupiedSeatsFor(performanceId)
    if (nextCapacity < sold) {
      throw createError({
        statusCode: 409,
        statusMessage: `This performance has already sold ${sold} tickets, so its capacity cannot drop to ${nextCapacity}. Refund or cancel tickets first, or pick a bigger venue.`,
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
